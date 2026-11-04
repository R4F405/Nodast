import vm from "node:vm";
import ts from "typescript";
import { applyEdits, encode, parse, print, type Expr } from "../src/index.ts";

export type Oracle =
  | { value: number | boolean }
  // Each call gives the arguments as JavaScript source, so they are built inside the sandbox.
  | { calls: Array<[string, number | boolean]> };

export type Goal = { goal: string; oracle: Oracle };

export const GOALS: readonly Goal[] = [
  { goal: "bind the sum of 1 and 2", oracle: { value: 3 } },
  { goal: "define a function that adds 1 to its number argument", oracle: { calls: [["5", 6], ["-1", 0]] } },
  { goal: "bind x to 1, then return 0 when x is less than 0, otherwise x", oracle: { value: 1 } },
  { goal: "multiply 3 by 4", oracle: { value: 12 } },
  {
    goal: "define a function of two numbers that returns whether the first is less than the second",
    oracle: { calls: [["1, 2", true], ["2, 1", false], ["2, 2", false]] },
  },
  {
    goal: "define a function that returns the larger of its two number arguments",
    oracle: { calls: [["1, 2", 2], ["5, 3", 5], ["4, 4", 4]] },
  },
  { goal: "compute the absolute value of -7 with a conditional", oracle: { value: 7 } },
  {
    goal: "define a function that returns 1 when its number argument is zero and 0 otherwise",
    oracle: { calls: [["0", 1], ["3", 0], ["-2", 0]] },
  },
  {
    goal: "define a function that clamps its number argument between 0 and 10",
    oracle: { calls: [["-5", 0], ["5", 5], ["15", 10]] },
  },
  {
    goal: "define a function of three numbers that returns the middle one by value",
    oracle: { calls: [["1, 2, 3", 2], ["3, 1, 2", 2], ["2, 3, 1", 2], ["5, 5, 1", 5]] },
  },
  {
    goal: "bind double to a function that doubles a number and inc to one that adds 1, then return inc applied to double applied to 5",
    oracle: { value: 11 },
  },
  {
    goal: "define a function that takes a function f and returns f applied to 5",
    oracle: { calls: [["(n) => n * 2", 10], ["(n) => n - 1", 4]] },
  },
];

export type EditTask = { goal: string; from: string; to: string };

// Constants start far above any node id, so a constant never reads like an id.
const BASE = 70_000;

export function chain(length: number): string {
  let body = `v${length}`;
  for (let i = length; i >= 1; i -= 1) {
    body = `(let v${i} (${opAt(i)} v${i - 1} ${BASE + i}) ${body})`;
  }
  return `(let v0 5 ${body})`;
}

export function editTasks(length: number): EditTask[] {
  const early = Math.max(1, Math.floor(length * 0.1));
  const late = Math.max(1, Math.floor(length * 0.88));
  let middle = Math.floor(length / 2);
  if (opAt(middle) !== "add") middle += 1;
  const constant = (i: number): EditTask => ({
    goal: `change the constant ${BASE + i} to 7`,
    from: `(let v${i} (${opAt(i)} v${i - 1} ${BASE + i})`,
    to: `(let v${i} (${opAt(i)} v${i - 1} 7)`,
  });
  return [
    constant(early),
    constant(late),
    {
      goal: `in the binding of v${middle}, subtract instead of add`,
      from: `(let v${middle} (add v${middle - 1} ${BASE + middle})`,
      to: `(let v${middle} (sub v${middle - 1} ${BASE + middle})`,
    },
  ];
}

function opAt(i: number): "add" | "sub" {
  return i % 2 === 1 ? "add" : "sub";
}

export function expectedAfter(task: EditTask, source: string): number | boolean {
  if (!source.includes(task.from)) throw new Error(`task does not match: ${task.goal}`);
  const parsed = parse(source.replace(task.from, task.to));
  if (!parsed.ok) throw new Error(parsed.error.message);
  const value = evaluate(print(parsed.tree));
  if (!value.ok) throw new Error(value.error);
  if (value.kind === "number") return Number(value.text);
  if (value.kind === "boolean") return value.text === "true";
  throw new Error("expected a primitive");
}

// Model output runs in a context with no host objects, no eval and a timeout on every step.
// The host never calls into guest values: each probe is guest code that returns a JSON string.
// node:vm is not a security boundary; this only keeps model replies away from host objects.
const TIMEOUT_MS = 500;

type Guest = { ok: true; ctx: vm.Context } | { ok: false; error: string };

function runGuest(js: string): Guest {
  const ctx = vm.createContext(Object.create(null) as object, {
    codeGeneration: { strings: false, wasm: false },
    microtaskMode: "afterEvaluate",
  });
  vm.runInContext("globalThis.console = { log() {}, info() {}, warn() {}, error() {} };", ctx);
  try {
    (ctx as Record<string, unknown>).__value = vm.runInContext(js, ctx, { timeout: TIMEOUT_MS });
    return { ok: true, ctx };
  } catch (error) {
    (ctx as Record<string, unknown>).__error = error;
    const text = probe(ctx, "String(__error && __error.name) + ' ' + String(__error && __error.message)");
    return { ok: false, error: text ?? "Error unknown" };
  }
}

function probe(ctx: vm.Context, expression: string): string | null {
  try {
    const out: unknown = vm.runInContext(`(() => { try { return String(${expression}); } catch { return "probe failed"; } })()`, ctx, {
      timeout: TIMEOUT_MS,
    });
    return typeof out === "string" ? out : null;
  } catch {
    return null;
  }
}

const DESCRIBE = "(typeof __v === 'function' ? 'a function' : JSON.stringify([typeof __v, String(__v)]))";

function describeIn(ctx: vm.Context, value: string): { kind: string; text: string } {
  const out = probe(ctx, `((__v) => ${DESCRIBE})(${value})`);
  if (out === null) return { kind: "error", text: "timeout" };
  if (out === "a function") return { kind: "function", text: "a function" };
  try {
    const [kind, text] = JSON.parse(out) as [string, string];
    return { kind, text };
  } catch {
    return { kind: "error", text: out };
  }
}

function same(got: { kind: string; text: string }, want: number | boolean): boolean {
  return got.kind === typeof want && got.text === String(want);
}

export function evaluate(source: string): { ok: true; kind: string; text: string } | { ok: false; error: string } {
  const js = ts.transpileModule(stripFence(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const guest = runGuest(js);
  if (!guest.ok) return guest;
  return { ok: true, ...describeIn(guest.ctx, "__value") };
}

export function judge(source: string, oracle: Oracle): string | null {
  const js = ts.transpileModule(stripFence(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const guest = runGuest(js);
  if (!guest.ok) return guest.error;
  const value = describeIn(guest.ctx, "__value");
  if ("value" in oracle) return same(value, oracle.value) ? null : `expected ${String(oracle.value)} got ${value.text}`;
  if (value.kind !== "function") return `expected a function got ${value.text}`;
  for (const [args, want] of oracle.calls) {
    const got = describeIn(guest.ctx, `__value(${args})`);
    if (!same(got, want)) return `call (${args}) expected ${String(want)} got ${got.text}`;
  }
  return null;
}

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
  const guest = runGuest(syntax.outputText);
  return guest.ok ? { ok: true } : { ok: false, error: guest.error };
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
