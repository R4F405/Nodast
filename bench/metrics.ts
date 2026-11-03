import vm from "node:vm";
import ts from "typescript";
import { applyEdits, encode, parse, print, type Expr } from "../src/index.ts";

export const GOALS = [
  "bind the sum of 1 and 2",
  "define a function that adds 1 to its number argument",
  "bind x to 1, then return 0 when x is less than 0, otherwise x",
  "multiply 3 by 4",
  "define a function of two numbers that returns whether the first is less than the second",
] as const;

export function lexicalTokens(text: string): number {
  return text.match(/[A-Za-z_][A-Za-z0-9_]*|===|=>|<=|>=|==|&&|\|\||\d+|\S/g)?.length ?? 0;
}

export function payload(source: string): {
  compactBytes: number;
  compactTokens: number;
  bufferBytes: number;
  printed: string;
  printedBytes: number;
  printedTokens: number;
} {
  const parsed = parse(source);
  if (!parsed.ok) throw new Error(parsed.error.message);
  const printed = print(parsed.tree);
  const buffer = encode(parsed.tree);
  return {
    compactBytes: Buffer.byteLength(source),
    compactTokens: lexicalTokens(source),
    bufferBytes: buffer.byteLength,
    printed,
    printedBytes: Buffer.byteLength(printed),
    printedTokens: lexicalTokens(printed),
  };
}

export function bush(depth: number): string {
  if (depth === 0) return "1";
  const child = bush(depth - 1);
  return `(add ${child} ${child})`;
}

export function editMillis(iterations = 10_000): number {
  const parsed = parse("(let x (add 1 2) x)");
  if (!parsed.ok) throw new Error(parsed.error.message);
  const node: Expr = { id: "n3", kind: "num", value: 9 };
  const once = applyEdits(parsed.tree, [{ op: "replace", id: "n3", node }]);
  if (!once.ok) throw new Error(once.error.code);
  if (print(once.tree) !== "const x = 9 + 2;\nx;\n") throw new Error("edit did not change the literal");
  let sink = 0;
  const warmup = Math.max(1, Math.floor(iterations / 20));
  for (let i = 0; i < warmup; i += 1) {
    const result = applyEdits(parsed.tree, [{ op: "replace", id: "n3", node }]);
    if (!result.ok) throw new Error(result.error.code);
    sink += result.tree.id.length;
  }
  const samples: bigint[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = process.hrtime.bigint();
    const result = applyEdits(parsed.tree, [{ op: "replace", id: "n3", node }]);
    if (!result.ok) throw new Error(result.error.code);
    sink += result.tree.id.length;
    samples.push(process.hrtime.bigint() - start);
  }
  if (sink === Number.MIN_SAFE_INTEGER) process.stderr.write("sink\n");
  samples.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const median = samples[Math.floor(samples.length / 2)] ?? 0n;
  return Number(median) / 1e6;
}

export function plainVerdict(source: string): { ok: true } | { ok: false; error: string } {
  const code = stripFence(source);
  if (code === "") return { ok: false, error: "empty" };
  const syntax = ts.transpileModule(code, {
    fileName: "generated.ts",
    reportDiagnostics: true,
    compilerOptions: { strict: true, target: ts.ScriptTarget.ES2022 },
  });
  const syntaxError = (syntax.diagnostics ?? []).find((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (syntaxError !== undefined) {
    return { ok: false, error: `SyntaxError ${flatten(syntaxError.messageText)}` };
  }
  const typed = typeError(code);
  if (typed !== undefined) return { ok: false, error: `TypeError ${typed}` };
  try {
    vm.runInNewContext(syntax.outputText, Object.create(null) as vm.Context, { timeout: 500 });
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `${name} ${message}` };
  }
  return { ok: true };
}

export function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
}

function typeError(source: string): string | undefined {
  const fileName = "generated.ts";
  const options: ts.CompilerOptions = {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    noEmit: true,
    types: [],
    skipLibCheck: true,
  };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, onError, shouldCreate) => {
    if (name === fileName) return ts.createSourceFile(name, source, languageVersion, true);
    return read(name, languageVersion, onError, shouldCreate);
  };
  const program = ts.createProgram([fileName], options, host);
  const diagnostic = ts.getPreEmitDiagnostics(program).find((item) => item.category === ts.DiagnosticCategory.Error);
  if (diagnostic === undefined) return undefined;
  return flatten(diagnostic.messageText);
}

function flatten(message: string | ts.DiagnosticMessageChain): string {
  return ts.flattenDiagnosticMessageText(message, " ");
}
