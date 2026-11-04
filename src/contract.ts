import { check, type CheckError } from "./check.ts";
import { compact, findNode, snippet, type Layout } from "./compact.ts";
import { applyEdits, type Edit, type EditError } from "./edit.ts";
import type { Expr, SourcePosition } from "./ir.ts";
import { parse } from "./parse.ts";
import { print } from "./print.ts";

export type Model = {
  complete(prompt: string): string | Promise<string>;
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
  | CheckError
  | EditError;

export type RunResult =
  | { ok: true; attempts: number; source: string }
  | { ok: false; attempts: number; error: ContractError };

type RawEdit =
  | { op: "replace"; id: string; expr: Expr }
  | { op: "insert"; id: string; index: number; expr: Expr }
  | { op: "delete"; id: string };

type Rejection = { response: string; error: string };

const DEFAULT_ATTEMPTS = 3;

export async function run(
  input: RunInput,
  model: Model,
  options?: { attempts?: number; layout?: Layout },
): Promise<RunResult> {
  const attempts = options?.attempts ?? DEFAULT_ATTEMPTS;
  const layout = options?.layout ?? "lines";
  const loaded = loadProgram(input.program);
  if (!loaded.ok) return { ok: false, attempts: 0, error: loaded.error };

  const rejections: Rejection[] = [];
  let last: ContractError = { code: "empty-response" };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let reply: string;
    try {
      reply = await model.complete(renderPrompt(input.goal, loaded.tree, rejections, layout));
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

export function fixture(responses: readonly string[]): Model & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    prompts,
    complete(prompt: string) {
      prompts.push(prompt);
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
  if (leadingName(text) !== "edits") return { ok: false, error: { code: "expected-edits" } };
  const edits = parseEdits(text);
  if (!edits.ok) return edits;
  const applied = applyAll(tree, edits.edits);
  if (!applied.ok) return applied;
  const checked = check(applied.tree);
  if (!checked.ok) return { ok: false, error: checked.error, tree: applied.tree };
  return { ok: true, source: print(applied.tree) };
}

function applyAll(tree: Expr, edits: readonly RawEdit[]): { ok: true; tree: Expr } | { ok: false; error: EditError } {
  let draft = tree;
  for (let at = 0; at < edits.length; at += 1) {
    const raw = edits[at];
    if (raw === undefined) continue;
    const edit = prepare(draft, raw);
    const applied = applyEdits(draft, [edit]);
    if (!applied.ok) return { ok: false, error: { ...applied.error, at } };
    draft = applied.tree;
  }
  return { ok: true, tree: draft };
}

function prepare(tree: Expr, edit: RawEdit): Edit {
  if (edit.op === "delete") return { op: "delete", id: edit.id };
  const node = renumber(edit.expr, collectIds(tree));
  if (edit.op === "replace") return { op: "replace", id: edit.id, node };
  return { op: "insert", id: edit.id, index: edit.index, node };
}

const LANGUAGE = [
  "Reply with only one program, or one (edits ...) list. No prose, no code fences.",
  "",
  "language:",
  "number: 0 12 -4    bool: true false    name: x total_2",
  "(let name value body)    bind name to value, visible only inside body",
  "(fn (a b) body)          function; parameters are bare names, no types",
  "(if cond then else)",
  "(add a b) (sub a b) (mul a b) (div a b)    numbers to number",
  "(eq a b) (lt a b) (gt a b) (lte a b) (gte a b)    numbers to bool",
  "(f a b)                  call f with a and b",
  "Each form takes exactly the arguments shown. There are no infix operators and no other keywords.",
  "",
  "edits, only when a program is given:",
  "(edits (replace id expr) (insert id index expr) (delete id))",
  "Each node of the given program is prefixed with its id, like n4:3. Ids never appear inside expr.",
  "replace swaps any node. insert adds an argument to the call with that id. delete removes that call argument.",
  "",
  "examples:",
  "goal: bind the difference of 8 and 3",
  "program: none",
  "(let x (sub 8 3) x)",
  "",
  "goal: define a function that doubles its argument",
  "program: none",
  "(fn (n) (mul n 2))",
  "",
  "goal: change 3 to 5",
  "program: n1:(let x n2:(sub n3:8 n4:3) n5:x)",
  "(edits (replace n4 5))",
];

function renderPrompt(goal: string, program: Expr | undefined, rejections: readonly Rejection[], layout: Layout): string {
  const shown = program === undefined ? "none" : compact(program, { ids: true, layout });
  const lines = [
    ...LANGUAGE,
    "",
    `goal: ${goal.replace(/\s+/g, " ").trim()}`,
    shown.includes("\n") ? `program:\n${shown}` : `program: ${shown}`,
  ];
  for (const rejection of rejections) {
    lines.push("", "rejected:", rejection.response.trim(), "error:", rejection.error);
  }
  if (rejections.length > 0) lines.push("", "Reply again with a corrected answer.");
  return `${lines.join("\n")}\n`;
}

function errorLine(error: ContractError, tree?: Expr): string {
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
      return "expected-program";
    case "expected-edits":
      return "expected-edits";
    case "parse":
      return `parse ${error.line}:${error.column} ${error.message}`;
    case "response":
      return `response ${error.line}:${error.column} ${error.message}`;
    case "model-error":
      return `model-error ${error.message}`;
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
    case "ambiguous-type":
      return `ambiguous-type ${error.nodeId} ${error.name}`;
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

function renumber(expr: Expr, taken: Set<string>): Expr {
  let next = 1;
  const fresh = (): string => {
    while (taken.has(`n${next}`)) next += 1;
    const id = `n${next}`;
    taken.add(id);
    next += 1;
    return id;
  };
  const walk = (node: Expr): Expr => {
    const id = fresh();
    switch (node.kind) {
      case "num":
        return { id, kind: "num", value: node.value };
      case "bool":
        return { id, kind: "bool", value: node.value };
      case "var":
        return { id, kind: "var", name: node.name };
      case "add":
      case "sub":
      case "mul":
      case "div":
      case "eq":
      case "lt":
      case "gt":
      case "lte":
      case "gte":
        return { id, kind: node.kind, left: walk(node.left), right: walk(node.right) };
      case "let":
        return { id, kind: "let", name: node.name, value: walk(node.value), body: walk(node.body) };
      case "fn":
        return { id, kind: "fn", params: [...node.params], body: walk(node.body) };
      case "call":
        return { id, kind: "call", callee: walk(node.callee), args: node.args.map((arg) => walk(arg)) };
      case "if":
        return { id, kind: "if", cond: walk(node.cond), then: walk(node.then), else: walk(node.else) };
    }
  };
  return walk(expr);
}

function collectIds(expr: Expr, into = new Set<string>()): Set<string> {
  into.add(expr.id);
  for (const child of children(expr)) collectIds(child, into);
  return into;
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

function isDigit(char: string | undefined): char is string {
  return char !== undefined && char >= "0" && char <= "9";
}

function isNameStart(char: string | undefined): char is string {
  return char !== undefined && ((char >= "A" && char <= "Z") || (char >= "a" && char <= "z") || char === "_");
}

function isNameChar(char: string | undefined): char is string {
  return isNameStart(char) || isDigit(char);
}
