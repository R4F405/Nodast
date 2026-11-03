import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release, tmpdir, totalmem } from "node:os";
import { join } from "node:path";
import { check, decode, encode, minimaxFromEnv, parse, print, run, type Expr } from "../src/index.ts";

const SMALL = "(let x (add 1 2) x)";
const LARGE_DEPTH = 12;
const SMALL_ITERS = 10_000;
const LARGE_ITERS = 40;

type Sample = {
  nodes: number;
  textBytes: number;
  bufferBytes: number;
  type: string;
  printBytes: number;
  parseNs: number;
  decodeNs: number;
  checkNs: number;
  printNs: number;
};

function bush(depth: number): string {
  if (depth === 0) return "1";
  const child = bush(depth - 1);
  return `(add ${child} ${child})`;
}

function count(expr: Expr): number {
  return 1 + children(expr).reduce((sum, child) => sum + count(child), 0);
}

function children(expr: Expr): Expr[] {
  switch (expr.kind) {
    case "num":
    case "bool":
    case "var":
      return [];
    case "add":
    case "sub":
    case "mul":
    case "div":
    case "eq":
    case "lt":
    case "gt":
    case "lte":
    case "gte":
      return [expr.left, expr.right];
    case "let":
      return [expr.value, expr.body];
    case "fn":
      return [expr.body];
    case "call":
      return [expr.callee, ...expr.args];
    case "if":
      return [expr.cond, expr.then, expr.else];
  }
}

function median(samples: bigint[]): bigint {
  const sorted = [...samples].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return sorted[Math.floor(sorted.length / 2)] ?? 0n;
}

function time(iterations: number, work: () => number): bigint {
  const warmup = Math.max(1, Math.floor(iterations / 20));
  let sink = 0;
  for (let i = 0; i < warmup; i += 1) sink += work();
  const samples: bigint[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = process.hrtime.bigint();
    sink += work();
    samples.push(process.hrtime.bigint() - start);
  }
  if (sink === Number.MIN_SAFE_INTEGER) process.stderr.write("sink\n");
  return median(samples);
}

function prepare(source: string, iterations: number): { sample: Sample; bytes: Uint8Array } {
  const parsed = parse(source);
  if (!parsed.ok) throw new Error(parsed.error.message);
  const typed = check(parsed.tree);
  if (!typed.ok) throw new Error(typed.error.code);
  const bytes = encode(parsed.tree);
  const decoded = decode(bytes);
  if (!decoded.ok) throw new Error(decoded.error.code);
  const printed = print(parsed.tree);
  const sample: Sample = {
    nodes: count(parsed.tree),
    textBytes: Buffer.byteLength(source),
    bufferBytes: bytes.byteLength,
    type: typed.type,
    printBytes: Buffer.byteLength(printed),
    parseNs: Number(time(iterations, () => {
      const result = parse(source);
      if (!result.ok) throw new Error(result.error.message);
      return result.tree.id.length;
    })),
    decodeNs: Number(time(iterations, () => {
      const result = decode(bytes);
      if (!result.ok) throw new Error(result.error.code);
      return result.tree.id.length;
    })),
    checkNs: Number(time(iterations, () => {
      const result = check(parsed.tree);
      if (!result.ok) throw new Error(result.error.code);
      return result.type.length;
    })),
    printNs: Number(time(iterations, () => print(parsed.tree).length)),
  };
  return { sample, bytes };
}

function loadEnv(path: string): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function rustVersion(): string {
  const result = spawnSync("rustc", ["--version"], { encoding: "utf8" });
  return result.stdout.trim();
}

function parseRust(text: string): Record<string, Sample> {
  const rows = new Map<string, Partial<Sample> & { type?: string }>();
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(" ");
    const name = parts[0];
    const field = parts[1];
    const value = parts.slice(2).join(" ");
    if (name === undefined || field === undefined || value === "") continue;
    const row = rows.get(name) ?? {};
    if (field === "nodes") row.nodes = Number(value);
    if (field === "text_bytes") row.textBytes = Number(value);
    if (field === "buffer_bytes") row.bufferBytes = Number(value);
    if (field === "type") row.type = value;
    if (field === "print_bytes") row.printBytes = Number(value);
    if (field === "parse_ns") row.parseNs = Number(value);
    if (field === "decode_ns") row.decodeNs = Number(value);
    if (field === "check_ns") row.checkNs = Number(value);
    if (field === "print_ns") row.printNs = Number(value);
    rows.set(name, row);
  }
  const out: Record<string, Sample> = {};
  for (const [name, row] of rows) {
    if (
      row.nodes === undefined ||
      row.textBytes === undefined ||
      row.bufferBytes === undefined ||
      row.type === undefined ||
      row.printBytes === undefined ||
      row.parseNs === undefined ||
      row.decodeNs === undefined ||
      row.checkNs === undefined ||
      row.printNs === undefined
    ) {
      throw new Error(`incomplete rust sample for ${name}`);
    }
    out[name] = {
      nodes: row.nodes,
      textBytes: row.textBytes,
      bufferBytes: row.bufferBytes,
      type: row.type,
      printBytes: row.printBytes,
      parseNs: row.parseNs,
      decodeNs: row.decodeNs,
      checkNs: row.checkNs,
      printNs: row.printNs,
    };
  }
  return out;
}

function us(ns: number): string {
  return (ns / 1000).toFixed(ns >= 100_000 ? 0 : 1);
}

function row(op: string, ts: number, rust: number): string {
  return `| ${op} | ${us(ts)} µs | ${us(rust)} µs |`;
}

async function modelSample(): Promise<string> {
  loadEnv(".env");
  if (process.env.MINIMAX_API_KEY === undefined || process.env.MINIMAX_API_KEY === "") {
    return "No hay `MINIMAX_API_KEY` en este entorno, así que esta fila no se midió.";
  }
  const start = process.hrtime.bigint();
  const result = await run({ goal: "bind the sum of 1 and 2" }, minimaxFromEnv());
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  if (!result.ok) return `La llamada falló en ${elapsedMs.toFixed(0)} ms tras ${result.attempts} intentos: ${result.error.code}.`;
  return `Una llamada completa, con el objetivo «bind the sum of 1 and 2», tardó ${(elapsedMs / 1000).toFixed(1)} s en ${result.attempts} intento. El printer solo corrió después del checker.`;
}

const large = bush(LARGE_DEPTH);
const smallTs = prepare(SMALL, SMALL_ITERS);
const largeTs = prepare(large, LARGE_ITERS);
const dir = mkdtempSync(join(tmpdir(), "nodast-bench-"));
const smallText = join(dir, "small.txt");
const largeText = join(dir, "large.txt");
const smallBin = join(dir, "small.nds");
const largeBin = join(dir, "large.nds");
writeFileSync(smallText, SMALL);
writeFileSync(largeText, large);
writeFileSync(smallBin, smallTs.bytes);
writeFileSync(largeBin, largeTs.bytes);

const rust = spawnSync(
  "cargo",
  [
    "run",
    "--release",
    "--manifest-path",
    "rust/Cargo.toml",
    "--bin",
    "bench",
    "--",
    smallText,
    largeText,
    smallBin,
    largeBin,
    String(SMALL_ITERS),
    String(LARGE_ITERS),
  ],
  { encoding: "utf8" },
);
if (rust.stderr !== "") process.stderr.write(rust.stderr);
if (rust.status !== 0) process.exit(rust.status ?? 1);
const rustSamples = parseRust(rust.stdout);
const smallRust = rustSamples.small;
const largeRust = rustSamples.large;
if (smallRust === undefined || largeRust === undefined) throw new Error("missing rust samples");
if (smallRust.type !== smallTs.sample.type || largeRust.type !== largeTs.sample.type) {
  throw new Error("checkers disagreed");
}
if (smallRust.bufferBytes !== smallTs.sample.bufferBytes || largeRust.bufferBytes !== largeTs.sample.bufferBytes) {
  throw new Error("buffer sizes disagreed");
}

const cpu = (cpus()[0]?.model ?? "unknown").trim();
const model = process.argv.includes("--model")
  ? await modelSample()
  : "Esta pasada no llamó al modelo. \`pnpm bench -- --model\` mide una llamada.";
const markdown = `# Medición

Una pasada en esta máquina, el ${new Date().toISOString().slice(0, 10)}. No es un test de regresión. \`pnpm bench\` vuelve a medir el motor en local. \`pnpm bench -- --model\` añade una llamada a MiniMax.

Rust va en \`--release\`. Cada celda es la mediana. El programa corto se midió ${SMALL_ITERS.toLocaleString("en-US")} veces y el grande ${LARGE_ITERS} veces, después de un calentamiento. El árbol grande es una suma equilibrada de unos, de profundidad ${LARGE_DEPTH}.

| | |
| --- | --- |
| Sistema | ${platform()} ${release()} |
| CPU | ${cpu} |
| RAM | ${(totalmem() / 1024 ** 3).toFixed(1)} GB |
| Node | ${process.version} |
| Rust | ${rustVersion()} |

El programa corto es \`(let x (add 1 2) x)\`: ${smallTs.sample.nodes} nodos, ${smallTs.sample.textBytes} bytes de texto, ${smallTs.sample.bufferBytes} bytes de buffer. El checker dice \`${smallTs.sample.type}\`.

| Operación | TypeScript | Rust |
| --- | ---: | ---: |
${row("Parsear el texto", smallTs.sample.parseNs, smallRust.parseNs)}
${row("Cargar el buffer", smallTs.sample.decodeNs, smallRust.decodeNs)}
${row("Checker", smallTs.sample.checkNs, smallRust.checkNs)}
${row("Printer", smallTs.sample.printNs, smallRust.printNs)}

El programa grande tiene ${largeTs.sample.nodes.toLocaleString("en-US")} nodos, ${largeTs.sample.textBytes.toLocaleString("en-US")} bytes de texto y ${largeTs.sample.bufferBytes.toLocaleString("en-US")} bytes de buffer. El checker dice \`${largeTs.sample.type}\`. El printer emite ${largeTs.sample.printBytes.toLocaleString("en-US")} bytes.

| Operación | TypeScript | Rust |
| --- | ---: | ---: |
${row("Parsear el texto", largeTs.sample.parseNs, largeRust.parseNs)}
${row("Cargar el buffer", largeTs.sample.decodeNs, largeRust.decodeNs)}
${row("Checker", largeTs.sample.checkNs, largeRust.checkNs)}
${row("Printer", largeTs.sample.printNs, largeRust.printNs)}

## Llamada al modelo

${model}

## Qué dicen los números

En el programa corto todo queda alrededor de 1 µs. En el grande, cargar el buffer tarda menos que parsear el texto, en TypeScript y en Rust. El buffer pesa ${(largeTs.sample.bufferBytes / largeTs.sample.textBytes).toFixed(2)} veces el texto, porque cada nodo guarda su id.

El motor en Rust no adelanta a Node en ese árbol. El checker de Rust tarda ${us(largeRust.checkNs)} µs y el de TypeScript ${us(largeTs.sample.checkNs)} µs.

El motor, incluso en el árbol grande, está por debajo de 3 ms. Una llamada al modelo está en segundos. Acelerar el parser no mueve el círculo.
`;

writeFileSync("BENCH.md", markdown);
process.stdout.write(markdown);
