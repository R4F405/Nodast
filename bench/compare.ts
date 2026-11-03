import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { run } from "../src/contract.ts";
import { GOALS, bush, editMillis, payload, plainVerdict, stripFence } from "./metrics.ts";

const ATTEMPTS = 3;

type Loop = { pass1: boolean; attempts: number; ok: boolean; completionTokens: number | null };

type Reply = { content: string; completionTokens: number | null };

function loadEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
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

async function ask(prompt: string): Promise<Reply> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (apiKey === undefined || apiKey === "") throw new Error("MINIMAX_API_KEY is missing");
  const model = process.env.MINIMAX_MODEL || "MiniMax-M3.1-Flash";
  const base = (process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 1024,
      reasoning_effort: "low",
    }),
  });
  if (!response.ok) throw new Error(`MiniMax ${response.status}`);
  const body = (await response.json()) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { completion_tokens?: number };
  };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") throw new Error("MiniMax returned an empty reply");
  const completionTokens = body.usage?.completion_tokens;
  return { content, completionTokens: typeof completionTokens === "number" ? completionTokens : null };
}

function plainPrompt(goal: string, rejections: { response: string; error: string }[]): string {
  const lines = ["Reply with only TypeScript that can be executed. No prose.", "", `goal: ${goal}`];
  for (const rejection of rejections) {
    lines.push("", "rejected:", rejection.response.trim(), "", "error:", rejection.error);
  }
  return `${lines.join("\n")}\n`;
}

async function nodastLoop(goal: string): Promise<Loop> {
  const tokens: number[] = [];
  const result = await run({ goal }, {
    async complete(prompt: string) {
      const reply = await ask(prompt);
      if (reply.completionTokens !== null) tokens.push(reply.completionTokens);
      return reply.content;
    },
  }, { attempts: ATTEMPTS });
  const completionTokens = tokens.length === 0 ? null : tokens[0] ?? null;
  return { pass1: result.ok && result.attempts === 1, attempts: result.attempts, ok: result.ok, completionTokens };
}

async function plainLoop(goal: string): Promise<Loop> {
  const rejections: { response: string; error: string }[] = [];
  let completionTokens: number | null = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    let reply: Reply;
    try {
      reply = await ask(plainPrompt(goal, rejections));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      rejections.push({ response: "", error: `model-error ${message}` });
      return { pass1: false, attempts: attempt, ok: false, completionTokens };
    }
    if (attempt === 1) completionTokens = reply.completionTokens;
    const verdict = plainVerdict(reply.content);
    if (verdict.ok) return { pass1: attempt === 1, attempts: attempt, ok: true, completionTokens };
    rejections.push({ response: stripFence(reply.content), error: verdict.error });
  }
  return { pass1: false, attempts: ATTEMPTS, ok: false, completionTokens };
}

function percent(hits: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((hits / total) * 100)}%`;
}

function mean(values: number[]): string {
  if (values.length === 0) return "—";
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);
}

function meanTokens(values: Array<number | null>): string {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) return "—";
  return (present.reduce((sum, value) => sum + value, 0) / present.length).toFixed(0);
}

function rustEditMs(): number {
  const result = spawnSync(
    "cargo",
    ["run", "--release", "--manifest-path", "rust/Cargo.toml", "--bin", "bench", "--", "--edit"],
    { encoding: "utf8" },
  );
  if (result.stderr !== "") process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error("rust edit bench failed");
  const line = result.stdout.split(/\r?\n/).find((item) => item.startsWith("edit_ns "));
  const ns = Number(line?.slice("edit_ns ".length));
  if (!Number.isFinite(ns)) throw new Error(`missing edit time: ${result.stdout}`);
  return ns / 1e6;
}

async function rewriteMs(): Promise<{ ms: number; tokens: number | null }> {
  const start = process.hrtime.bigint();
  const reply = await ask(
    "Reply with only the full TypeScript file. No prose.\nReplace the number 1 with 9. Rewrite the whole file.\n\nconst x = 1 + 2;\nx;\n",
  );
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  if (!reply.content.includes("9")) process.stderr.write("rewrite reply did not contain 9\n");
  return { ms, tokens: reply.completionTokens };
}

loadEnv(".env");
const samples = [
  payload("(let x (add 1 2) x)"),
  payload("(fn (x) (add x 1))"),
  payload("(let x 1 (if (lt x 0) 0 x))"),
  payload(bush(12)),
];
const labels = ["let y suma", "función de un argumento", "if con x ligado", "suma de 8191 nodos"];

const tsEdit = editMillis();
const rustEdit = rustEditMs();

const nodast: Loop[] = [];
const plain: Loop[] = [];
for (const goal of GOALS) {
  process.stderr.write(`nodast ${goal}\n`);
  nodast.push(await nodastLoop(goal));
  process.stderr.write(`plain ${goal}\n`);
  plain.push(await plainLoop(goal));
}
process.stderr.write("rewrite\n");
const rewrite = await rewriteMs();

const nodastPass = nodast.filter((item) => item.pass1).length;
const plainPass = plain.filter((item) => item.pass1).length;
const nodastFixed = nodast.filter((item) => item.ok).length;
const plainFixed = plain.filter((item) => item.ok).length;
const nodastRetries = nodast.filter((item) => item.ok && !item.pass1).map((item) => item.attempts - 1);
const plainRetries = plain.filter((item) => item.ok && !item.pass1).map((item) => item.attempts - 1);

const rows = GOALS.map((goal, index) => {
  const left = nodast[index];
  const right = plain[index];
  if (left === undefined || right === undefined) throw new Error("missing sample");
  return `| ${goal} | ${left.ok ? left.attempts : `${left.attempts} y falló`} | ${right.ok ? right.attempts : `${right.attempts} y falló`} |`;
});

const payloadRows = samples.map((sample, index) => {
  const label = labels[index] ?? "programa";
  return `| ${label} | ${sample.compactBytes} / ${sample.compactTokens} | ${sample.bufferBytes} | ${sample.printedBytes} / ${sample.printedTokens} |`;
});

const markdown = `# Medición

Cuatro números, el ${new Date().toISOString().slice(0, 10)}, con ${GOALS.length} objetivos y tope de ${ATTEMPTS} intentos. \`pnpm bench\` repite la pasada y llama a MiniMax. La velocidad interna del motor está aparte, en [bench/engine.md](bench/engine.md).

Los tokens del texto son léxicos: identificadores, números, operadores y signos, con el mismo contador en los dos textos. El buffer no es un flujo de tokens; se compara en bytes. Los tokens de respuesta, cuando MiniMax los informa, son \`completion_tokens\` de la primera respuesta.

## Validez estructural

Pass@1 es la primera respuesta. Nodast tiene que parsear y pasar \`check\`. El texto plano tiene que salir de \`tsc\` sin error y correr sin \`SyntaxError\` ni \`TypeError\`.

| | Nodast | Texto plano |
| --- | ---: | ---: |
| Pass@1 | ${nodastPass}/${GOALS.length} (${percent(nodastPass, GOALS.length)}) | ${plainPass}/${GOALS.length} (${percent(plainPass, GOALS.length)}) |
| Aciertos en ≤ ${ATTEMPTS} intentos | ${nodastFixed}/${GOALS.length} (${percent(nodastFixed, GOALS.length)}) | ${plainFixed}/${GOALS.length} (${percent(plainFixed, GOALS.length)}) |
| Reintentos medios tras el primer fallo, solo si luego acierta | ${mean(nodastRetries)} | ${mean(plainRetries)} |
| Tokens medios de la primera respuesta | ${meanTokens(nodast.map((item) => item.completionTokens))} | ${meanTokens(plain.map((item) => item.completionTokens))} |

| Objetivo | Intentos Nodast | Intentos texto plano |
| --- | ---: | ---: |
${rows.join("\n")}

## Payload

| Programa | Compacto, bytes / tokens | Buffer, bytes | TypeScript, bytes / tokens |
| --- | ---: | ---: | ---: |
${payloadRows.join("\n")}

## Edición

Cambiar el \`1\` de \`(let x (add 1 2) x)\` por \`9\`. La edición local es la mediana de 10.000 veces. La reescritura es una llamada que pide el archivo entero.

| Vía | Tiempo |
| --- | ---: |
| \`edit.ts\` | ${tsEdit.toFixed(3)} ms |
| \`edit.rs\` | ${rustEdit.toFixed(3)} ms |
| Reescribir el archivo con el modelo | ${rewrite.ms.toFixed(0)} ms |
`;

writeFileSync("BENCH.md", markdown);
process.stdout.write(markdown);
