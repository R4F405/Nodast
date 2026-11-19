import { check, type CheckError } from "./check.ts";
import { compact, findNode, snippet, type Layout } from "./compact.ts";
import { applyEdits, type Edit, type EditError } from "./edit.ts";
import type { Expr, SourcePosition } from "./ir.ts";
import { parse } from "./parse.ts";
import { print } from "./print.ts";
import { addParameter, collectIds, renameBinding, renumber } from "./scope.ts";

// prompt is the user message; system holds the fixed instructions, which a client should send as a
// system message so the task is never mistaken for one of the examples.
export type Model = {
  complete(prompt: string, system?: string): string | Promise<string>;
};

export type RunInput = {
  goal: string;
  program?: string;
};

export type ContractError =
  | { code: "empty-response" }
  | { code: "expected-program" }
  | { code: "expected-edits" }
  | { code: "parse"; message: string; line: number; column: number }
  | { code: "response"; message: string; line: number; column: number }
  | { code: "model-error"; message: string }
  | { code: "op"; message: string; at: number }
  | CheckError
  | EditError;

export type RunResult =
  | { ok: true; attempts: number; source: string }
  | { ok: false; attempts: number; error: ContractError };

type RawEdit =
  | { op: "replace"; id: string; expr: Expr }
  | { op: "insert"; id: string; index: number; expr: Expr }
  | { op: "delete"; id: string }
  | { op: "rename"; id: string; name: string }
  | { op: "param"; id: string; name: string; index: number; expr: string };

type Rejection = { response: string; error: string };

const DEFAULT_ATTEMPTS = 3;

export async function run(
  input: RunInput,
  model: Model,
  options?: { attempts?: number; layout?: Layout; prompts?: Prompts },
): Promise<RunResult> {
  const attempts = options?.attempts ?? DEFAULT_ATTEMPTS;
  const layout = options?.layout ?? "lines";
  const prompts = options?.prompts ?? {};
  const loaded = loadProgram(input.program);
  if (!loaded.ok) return { ok: false, attempts: 0, error: loaded.error };

  const rejections: Rejection[] = [];
  let last: ContractError = { code: "empty-response" };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let reply: string;
    try {
      const prompt = renderPrompt(input.goal, loaded.tree, rejections, layout, prompts);
      reply = await model.complete(prompt.user, prompt.system);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, attempts: attempt, error: { code: "model-error", message } };
    }
    const outcome = accept(loaded.tree, reply);
    if (outcome.ok) return { ok: true, attempts: attempt, source: outcome.source };
    last = outcome.error;
    rejections.push({ response: stripFence(reply), error: errorLine(outcome.error, outcome.tree) });
  }
  return { ok: false, attempts, error: last };
}

// prompts records the system and the user message of each call joined by a blank line.
export function fixture(responses: readonly string[]): Model & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    complete(prompt: string, system?: string) {
      prompts.push(system === undefined ? prompt : `${system}\n\n${prompt}`);
      const response = responses[prompts.length - 1];
      if (response === undefined) throw new Error("fixture exhausted");
      return response;
    },
  };
}

function loadProgram(program: string | undefined): { ok: true; tree: Expr | undefined } | { ok: false; error: ContractError } {
  if (program === undefined) return { ok: true, tree: undefined };
  const parsed = parse(program);
  if (!parsed.ok) {
    return {
      ok: false,
      error: {
        code: "parse",
        message: parsed.error.message,
        line: parsed.error.position.line,
        column: parsed.error.position.column,
      },
    };
  }
  const checked = check(parsed.tree);
  if (!checked.ok) return { ok: false, error: checked.error };
  return { ok: true, tree: parsed.tree };
}

type Outcome = { ok: true; source: string } | { ok: false; error: ContractError; tree?: Expr };

function accept(tree: Expr | undefined, reply: string): Outcome {
  const text = stripFence(reply);
  if (text === "") return { ok: false, error: { code: "empty-response" } };
  if (tree === undefined) {
    if (leadingName(text) === "edits") return { ok: false, error: { code: "expected-program" } };
    const parsed = parse(text);
    if (!parsed.ok) {
      return {
        ok: false,
        error: {
          code: "parse",
          message: parsed.error.message,
          line: parsed.error.position.line,
          column: parsed.error.position.column,
        },
      };
    }
    const checked = check(parsed.tree);
    if (!checked.ok) return { ok: false, error: checked.error, tree: parsed.tree };
    return { ok: true, source: print(parsed.tree) };
  }
  const applied = applyEditText(tree, text);
  if (!applied.ok) return applied;
  return { ok: true, source: print(applied.tree) };
}

// Parses an (edits ...) list, applies it to a copy of tree and runs the checker on the result.
// New nodes never take an id from retired, so an id a model saw earlier keeps meaning that node or nothing.
export function applyEditText(
  tree: Expr,
  text: string,
  retired: ReadonlySet<string> = new Set(),
): { ok: true; tree: Expr; type: string } | { ok: false; error: ContractError; tree?: Expr } {
  if (leadingName(text) !== "edits") return { ok: false, error: { code: "expected-edits" } };
  // Models often copy ids into expr, like (replace n8 (sub n9:v1 n10:7)). A name never ends in ":", so an
  // id prefix can only be that: drop it instead of rejecting the edit.
  const edits = parseEdits(text.replace(/\bn\d+:/g, ""));
  if (!edits.ok) return edits;
  const applied = applyAll(tree, edits.edits, retired);
  if (!applied.ok) return applied;
  const checked = check(applied.tree);
  if (!checked.ok) return { ok: false, error: checked.error, tree: applied.tree };
  return { ok: true, tree: applied.tree, type: checked.type };
}

function applyAll(
  tree: Expr,
  edits: readonly RawEdit[],
  retired: ReadonlySet<string>,
): { ok: true; tree: Expr } | { ok: false; error: EditError | { code: "op"; message: string; at: number } } {
  let draft = tree;
  for (let at = 0; at < edits.length; at += 1) {
    const raw = edits[at];
    if (raw === undefined) continue;
    if (raw.op === "rename" || raw.op === "param") {
      // Scoped ops build the whole new tree at once; the checker still runs once, after the last edit.
      const result =
        raw.op === "rename"
          ? renameBinding(draft, raw.id, raw.name)
          : addParameter(draft, raw.id, raw.name, raw.expr, raw.index, new Set(retired));
      if (!result.ok) {
        return { ok: false, error: result.unknown ? { code: "unknown-id", id: raw.id, at } : { code: "op", message: result.message, at } };
      }
      draft = result.tree;
      continue;
    }
    const edit = prepare(draft, raw, retired);
    const applied = applyEdits(draft, [edit]);
    if (!applied.ok) return { ok: false, error: { ...applied.error, at } };
    draft = applied.tree;
  }
  return { ok: true, tree: draft };
}

function prepare(tree: Expr, edit: Exclude<RawEdit, { op: "rename" | "param" }>, retired: ReadonlySet<string>): Edit {
  if (edit.op === "delete") return { op: "delete", id: edit.id };
  const taken = collectIds(tree);
  for (const id of retired) taken.add(id);
  const node = renumber(edit.expr, taken);
  if (edit.op === "replace") return { op: "replace", id: edit.id, node };
  return { op: "insert", id: edit.id, index: edit.index, node };
}

// The grammar every prompt teaches. Writing and editing add their own rules and examples on top,
// so a model that writes never reads about edits and one that edits never reads write examples.
// Calls and fn take any number of arguments: "each form takes exactly the arguments shown" next to (f a b)
// made MiniMax believe every call takes two.
export const GRAMMAR = [
  "language:",
  "number: 0 12 -4    bool: true false    name: x total_2",
  "(let name value body)    bind name to value, visible only inside body",
  "(fn (n) body) (fn (a b) body)    function with any number of parameters; bare names, no types",
  "(f x) (f a b)            call f with any number of arguments",
  "(if cond then else)",
  "(add a b) (sub a b) (mul a b) (div a b)    numbers to number",
  "(eq a b) (lt a b) (gt a b) (lte a b) (gte a b)    numbers to bool",
  "let, if and the operators take exactly the arguments shown. No infix operators, no other keywords.",
];

export const EDIT_RULES = [
  "edits:",
  "(edits (replace id expr) (insert id index expr) (delete id) (rename id name) (param id name index expr))",
  "Each node of the program is prefixed with its id, like n4:3. Copy each id from the program; never compute one. expr is written without ids.",
  "replace swaps any node. insert adds an argument to the call with that id. delete removes that call argument.",
  "rename gives a let, or the binding a use at id refers to, a new name, with every use of it and nothing else.",
  "param adds parameter name at index to a let-bound fn (id is its let, its fn or a use) and passes expr at every call of it.",
  "Edits apply in order.",
];

// The fixed instructions go to the system message and the goal to the user message: with both in one
// user message, MiniMax spent most of its reasoning on which line was the task.
export const WRITE_PROMPT = [
  "Write one Nodast program, a tiny Lisp, that does the goal the user gives.",
  "Reply with only the program: no prose, no code fences. Its value is the result; when the goal asks for a function, the program is that fn.",
  "",
  ...GRAMMAR,
  "",
  "examples:",
  "goal: bind the difference of 8 and 3",
  "(let x (sub 8 3) x)",
  "",
  "goal: define a function that doubles its argument",
  "(fn (n) (mul n 2))",
];

export const EDIT_PROMPT = [
  "Edit the Nodast program the user gives, a tiny Lisp, so it does the goal. Reply with only one (edits ...) list: no prose, no code fences.",
  "",
  ...GRAMMAR,
  "",
  ...EDIT_RULES,
  "",
  "example:",
  "goal: change 3 to 5",
  "program: n1:(let x n2:(sub n3:8 n4:3) n5:x)",
  "(edits (replace n4 5))",
];

// Replacements for the fixed instructions, so a caller can try other wordings or examples.
export type Prompts = { write?: readonly string[]; edit?: readonly string[] };

function renderPrompt(
  goal: string,
  program: Expr | undefined,
  rejections: readonly Rejection[],
  layout: Layout,
  prompts: Prompts = {},
): { system: string; user: string } {
  const head = program === undefined ? (prompts.write ?? WRITE_PROMPT) : (prompts.edit ?? EDIT_PROMPT);
  const lines = [`goal: ${goal.replace(/\s+/g, " ").trim()}`];
  if (program !== undefined) {
    const shown = compact(program, { ids: true, layout });
    lines.push(shown.includes("\n") ? `program:\n${shown}` : `program: ${shown}`);
  }
  for (const rejection of rejections) {
    lines.push("", "rejected:", rejection.response.trim(), "error:", rejection.error);
  }
  if (rejections.length > 0) lines.push("", "Reply again with a corrected answer.");
  return { system: head.join("\n"), user: `${lines.join("\n")}\n` };
}

export function errorLine(error: ContractError, tree?: Expr): string {
  const base = baseLine(error);
  if (tree === undefined || !("nodeId" in error)) return base;
  const node = findNode(tree, error.nodeId);
  return node === undefined ? base : `${base} in ${snippet(node)}`;
}

function baseLine(error: ContractError): string {
  switch (error.code) {
    case "empty-response":
      return "empty-response";
    case "expected-program":
      return "expected-program, write one program like (let x (add 1 2) x)";
    case "expected-edits":
      return "expected-edits, write one list like (edits (replace n4 7))";
    case "parse":
      return `parse ${error.line}:${error.column} ${error.message}`;
    case "response":
      return `response ${error.line}:${error.column} ${error.message}`;
    case "model-error":
      return `model-error ${error.message}`;
    case "op":
      return `${error.message} at ${error.at}`;
    case "duplicate-id":
      return "at" in error ? `duplicate-id ${error.id} at ${error.at}` : `duplicate-id ${error.nodeId}`;
    case "undefined-name":
      return `undefined-name ${error.nodeId} ${error.name}`;
    case "type-mismatch":
      return `type-mismatch ${error.nodeId} expected ${error.expected} actual ${error.actual}`;
    case "arity-mismatch":
      return `arity-mismatch ${error.nodeId} expected ${error.expected} actual ${error.actual}`;
    case "not-a-function":
      return `not-a-function ${error.nodeId} actual ${error.actual}`;
    case "infinite-type":
      return `infinite-type ${error.nodeId} ${error.name}`;
    case "unknown-id":
      return `unknown-id ${error.id} at ${error.at}`;
    case "cannot-delete":
      return `cannot-delete ${error.id} at ${error.at}`;
    case "cannot-insert":
      return `cannot-insert ${error.id} at ${error.at}`;
    case "index-out-of-range":
      return `index-out-of-range ${error.id} at ${error.at} index ${error.index} length ${error.length}`;
  }
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
}

function leadingName(source: string): string | undefined {
  const scanner = new Scanner(source);
  scanner.skipWs();
  if (scanner.peek() !== "(") return undefined;
  scanner.bump("(");
  scanner.skipWs();
  if (!isNameStart(scanner.peek())) return undefined;
  return scanner.readName();
}

function parseEdits(source: string): { ok: true; edits: RawEdit[] } | { ok: false; error: ContractError } {
  try {
    return { ok: true, edits: new Scanner(source).parseEdits() };
  } catch (error) {
    if (error instanceof ResponseFailure) return { ok: false, error: error.detail };
    throw error;
  }
}

class ResponseFailure extends Error {
  readonly detail: { code: "response"; message: string; line: number; column: number };

  constructor(message: string, position: SourcePosition) {
    super(message);
    this.name = "ResponseFailure";
    this.detail = { code: "response", message, line: position.line, column: position.column };
  }
}

class Scanner {
  private readonly source: string;
  private index = 0;
  private line = 1;
  private column = 1;

  constructor(source: string) {
    this.source = source;
  }

  parseEdits(): RawEdit[] {
    this.skipWs();
    const open = this.position();
    if (this.peek() !== "(") this.fail("Expected edits", this.position());
    this.bump("(");
    this.skipWs();
    this.readName();
    const edits: RawEdit[] = [];
    for (;;) {
      this.skipWs();
      if (this.peek() === ")") {
        this.bump(")");
        break;
      }
      if (this.peek() === undefined) this.fail("Unclosed '('", open);
      edits.push(this.readEdit());
    }
    this.skipWs();
    if (this.peek() !== undefined) this.fail("Unexpected trailing input", this.position());
    return edits;
  }

  private readEdit(): RawEdit {
    this.skipWs();
    const open = this.position();
    if (this.peek() !== "(") this.fail("Expected an edit", this.position());
    this.bump("(");
    this.skipWs();
    if (!isNameStart(this.peek())) this.fail("Expected an edit", this.position());
    const namePos = this.position();
    const name = this.readName();
    this.skipWs();
    if (!isNameStart(this.peek())) this.fail("Expected an id", this.position());
    const id = this.readName();
    if (name === "delete") {
      this.skipWs();
      this.expectClose(open);
      return { op: "delete", id };
    }
    if (name === "replace") {
      const expr = this.readExpr();
      this.skipWs();
      this.expectClose(open);
      return { op: "replace", id, expr };
    }
    if (name === "insert") {
      this.skipWs();
      const index = this.readIndex();
      const expr = this.readExpr();
      this.skipWs();
      this.expectClose(open);
      return { op: "insert", id, index, expr };
    }
    if (name === "rename") {
      this.skipWs();
      if (!isNameStart(this.peek())) this.fail("Expected a name", this.position());
      const to = this.readName();
      this.skipWs();
      this.expectClose(open);
      return { op: "rename", id, name: to };
    }
    if (name === "param") {
      this.skipWs();
      if (!isNameStart(this.peek())) this.fail("Expected a name", this.position());
      const to = this.readName();
      this.skipWs();
      const index = this.readIndex();
      this.skipWs();
      const from = this.index;
      this.readExpr();
      const expr = this.source.slice(from, this.index);
      this.skipWs();
      this.expectClose(open);
      return { op: "param", id, name: to, index, expr };
    }
    this.fail(`Unknown edit ${name}`, namePos);
  }

  private readExpr(): Expr {
    this.skipWs();
    const start = this.position();
    const startIndex = this.index;
    if (this.peek() === "(") {
      let depth = 0;
      while (this.peek() !== undefined) {
        const char = this.peek();
        if (char === undefined) break;
        if (char === "(") depth += 1;
        if (char === ")") depth -= 1;
        this.bump(char);
        if (depth === 0) break;
      }
      if (depth !== 0) this.fail("Unclosed '('", start);
    } else if (this.peek() === "-" || isDigit(this.peek())) {
      this.readNumberText();
    } else if (isNameStart(this.peek())) {
      this.readName();
    } else {
      const char = this.peek();
      if (char === undefined) this.fail("Expected an expression", start);
      this.fail(`Unexpected character '${char}'`, start);
    }
    const parsed = parse(this.source.slice(startIndex, this.index));
    if (!parsed.ok) {
      const line = parsed.error.position.line === 1 ? start.line : start.line + parsed.error.position.line - 1;
      const column =
        parsed.error.position.line === 1
          ? start.column + parsed.error.position.column - 1
          : parsed.error.position.column;
      this.fail(parsed.error.message, { offset: start.offset, line, column });
    }
    return parsed.tree;
  }

  private readIndex(): number {
    const start = this.position();
    if (!isDigit(this.peek())) this.fail("Expected an index", start);
    if (this.peek() === "0") {
      this.bump("0");
      if (isDigit(this.peek())) this.fail("Leading zeros are not allowed", start);
      return 0;
    }
    let digits = "";
    while (isDigit(this.peek())) {
      const digit = this.peek();
      if (digit === undefined) break;
      digits += digit;
      this.bump(digit);
    }
    return Number(digits);
  }

  private readNumberText(): void {
    if (this.peek() === "-") this.bump("-");
    while (isDigit(this.peek())) {
      const digit = this.peek();
      if (digit === undefined) break;
      this.bump(digit);
    }
  }

  readName(): string {
    const start = this.position();
    if (!isNameStart(this.peek())) this.fail("Expected a name", start);
    let name = "";
    while (isNameChar(this.peek())) {
      const char = this.peek();
      if (char === undefined) break;
      name += char;
      this.bump(char);
    }
    return name;
  }

  private expectClose(open: SourcePosition): void {
    if (this.peek() === undefined) this.fail("Unclosed '('", open);
    if (this.peek() !== ")") this.fail("Expected ')'", this.position());
    this.bump(")");
  }

  skipWs(): void {
    for (;;) {
      const char = this.peek();
      if (char === " " || char === "\t") {
        this.bump(char);
        continue;
      }
      if (char === "\n") {
        this.bump(char);
        continue;
      }
      if (char === "\r") {
        this.index += 1;
        if (this.peek() === "\n") this.index += 1;
        this.line += 1;
        this.column = 1;
        continue;
      }
      return;
    }
  }

  peek(): string | undefined {
    return this.source[this.index];
  }

  bump(char: string): void {
    this.index += 1;
    if (char === "\n") {
      this.line += 1;
      this.column = 1;
      return;
    }
    this.column += 1;
  }

  position(): SourcePosition {
    return { offset: this.index, line: this.line, column: this.column };
  }

  private fail(message: string, position: SourcePosition): never {
    throw new ResponseFailure(message, position);
  }
}

function isDigit(char: string | undefined): char is string {
  return char !== undefined && char >= "0" && char <= "9";
}

function isNameStart(char: string | undefined): char is string {
  return char !== undefined && ((char >= "A" && char <= "Z") || (char >= "a" && char <= "z") || char === "_");
}

function isNameChar(char: string | undefined): char is string {
  return isNameStart(char) || isDigit(char);
}
