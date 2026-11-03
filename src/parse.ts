import type { Expr, ParseResult, SourcePosition } from "./ir.ts";

const RESERVED = new Set([
  "let",
  "fn",
  "if",
  "add",
  "sub",
  "mul",
  "div",
  "eq",
  "lt",
  "gt",
  "lte",
  "gte",
  "true",
  "false",
]);

type BinaryKind = "add" | "sub" | "mul" | "div" | "eq" | "lt" | "gt" | "lte" | "gte";

const BINARY = new Set<BinaryKind>([
  "add",
  "sub",
  "mul",
  "div",
  "eq",
  "lt",
  "gt",
  "lte",
  "gte",
]);

class ParseFailure extends Error {
  readonly position: SourcePosition;

  constructor(message: string, position: SourcePosition) {
    super(message);
    this.name = "ParseFailure";
    this.position = position;
  }
}

class Parser {
  private readonly source: string;
  private index = 0;
  private line = 1;
  private column = 1;
  private nextId = 1;

  constructor(source: string) {
    this.source = source;
  }

  parseProgram(): Expr {
    this.skipWs();
    if (this.peek() === undefined) this.fail("Expected an expression", this.position());
    const tree = this.parseExpr();
    this.skipWs();
    if (this.peek() !== undefined) this.fail("Unexpected trailing input", this.position());
    return tree;
  }

  private parseExpr(): Expr {
    this.skipWs();
    const start = this.position();
    const char = this.peek();
    if (char === undefined) this.fail("Expected an expression", start);
    if (char === "(") return this.parseList();
    if (char === "-" || isDigit(char)) return this.parseNumber();
    if (isNameStart(char)) return this.parseNameExpr();
    this.fail(`Unexpected character '${char}'`, start);
  }

  private parseList(): Expr {
    const open = this.position();
    this.bump("(");
    this.skipWs();
    if (this.peek() === undefined) this.fail("Unclosed '('", open);
    if (this.peek() === ")") this.fail("Expected an expression", this.position());

    if (isNameStart(this.peek())) {
      const headPos = this.position();
      const head = this.readName();
      if (head === "let") return this.parseLet(open, headPos);
      if (head === "fn") return this.parseFn(open, headPos);
      if (head === "if") return this.parseIf(open, headPos);
      if (isBinary(head)) return this.parseBinary(open, headPos, head);
      const callId = this.alloc();
      const callee = this.nameNode(head, headPos);
      return this.finishCall(open, callId, callee);
    }

    const callId = this.alloc();
    const callee = this.parseExpr();
    return this.finishCall(open, callId, callee);
  }

  private parseLet(open: SourcePosition, headPos: SourcePosition): Expr {
    const id = this.alloc();
    this.skipWs();
    if (!isNameStart(this.peek())) {
      if (this.peek() === undefined) this.fail("Unclosed '('", open);
      this.fail("Expected a name", this.position());
    }
    const namePos = this.position();
    const name = this.readName();
    if (RESERVED.has(name)) this.fail(`${name} is a reserved word`, namePos);
    const args = this.parseArgs(open);
    if (args.length !== 2) {
      this.fail(`let expects 3 arguments, got ${args.length + 1}`, headPos);
    }
    const value = args[0];
    const body = args[1];
    if (value === undefined || body === undefined) {
      this.fail(`let expects 3 arguments, got ${args.length + 1}`, headPos);
    }
    return { id, kind: "let", name, value, body };
  }

  private parseFn(open: SourcePosition, headPos: SourcePosition): Expr {
    const id = this.alloc();
    this.skipWs();
    if (this.peek() !== "(") {
      if (this.peek() === undefined) this.fail("Unclosed '('", open);
      this.fail("Expected a parameter list", this.position());
    }
    const paramsOpen = this.position();
    this.bump("(");
    const params: string[] = [];
    const seen = new Set<string>();
    for (;;) {
      this.skipWs();
      if (this.peek() === ")") {
        this.bump(")");
        break;
      }
      if (this.peek() === undefined) this.fail("Unclosed '('", paramsOpen);
      if (!isNameStart(this.peek())) this.fail("Expected a name", this.position());
      const namePos = this.position();
      const name = this.readName();
      if (RESERVED.has(name)) this.fail(`${name} is a reserved word`, namePos);
      if (seen.has(name)) this.fail(`Duplicate parameter ${name}`, namePos);
      seen.add(name);
      params.push(name);
    }
    const args = this.parseArgs(open);
    if (args.length !== 1) {
      this.fail(`fn expects 2 arguments, got ${args.length + 1}`, headPos);
    }
    const body = args[0];
    if (body === undefined) this.fail(`fn expects 2 arguments, got ${args.length + 1}`, headPos);
    return { id, kind: "fn", params, body };
  }

  private parseIf(open: SourcePosition, headPos: SourcePosition): Expr {
    const id = this.alloc();
    const args = this.parseArgs(open);
    if (args.length !== 3) this.fail(`if expects 3 arguments, got ${args.length}`, headPos);
    const cond = args[0];
    const then = args[1];
    const elseBranch = args[2];
    if (cond === undefined || then === undefined || elseBranch === undefined) {
      this.fail(`if expects 3 arguments, got ${args.length}`, headPos);
    }
    return { id, kind: "if", cond, then, else: elseBranch };
  }

  private parseBinary(open: SourcePosition, headPos: SourcePosition, op: BinaryKind): Expr {
    const id = this.alloc();
    const args = this.parseArgs(open);
    if (args.length !== 2) this.fail(`${op} expects 2 arguments, got ${args.length}`, headPos);
    const left = args[0];
    const right = args[1];
    if (left === undefined || right === undefined) {
      this.fail(`${op} expects 2 arguments, got ${args.length}`, headPos);
    }
    return { id, kind: op, left, right };
  }

  private finishCall(open: SourcePosition, id: string, callee: Expr): Expr {
    const args = this.parseArgs(open);
    return { id, kind: "call", callee, args };
  }

  private parseArgs(open: SourcePosition): Expr[] {
    const args: Expr[] = [];
    for (;;) {
      this.skipWs();
      if (this.peek() === ")") {
        this.bump(")");
        return args;
      }
      if (this.peek() === undefined) this.fail("Unclosed '('", open);
      args.push(this.parseExpr());
    }
  }

  private parseNameExpr(): Expr {
    const pos = this.position();
    const name = this.readName();
    return this.nameNode(name, pos);
  }

  private nameNode(name: string, pos: SourcePosition): Expr {
    if (name === "true") return { id: this.alloc(), kind: "bool", value: true };
    if (name === "false") return { id: this.alloc(), kind: "bool", value: false };
    if (RESERVED.has(name)) this.fail(`${name} is a reserved word`, pos);
    return { id: this.alloc(), kind: "var", name };
  }

  private parseNumber(): Expr {
    const start = this.position();
    let negative = false;
    if (this.peek() === "-") {
      const next = this.source[this.index + 1];
      if (next === undefined || !isDigit(next)) this.fail("Unexpected character '-'", start);
      negative = true;
      this.bump("-");
    }
    if (!isDigit(this.peek())) this.fail("Expected an expression", start);
    if (this.peek() === "0") {
      this.bump("0");
      if (isDigit(this.peek())) this.fail("Leading zeros are not allowed", start);
      return { id: this.alloc(), kind: "num", value: 0 };
    }
    let digits = "";
    while (isDigit(this.peek())) {
      const digit = this.peek();
      if (digit === undefined) break;
      digits += digit;
      this.bump(digit);
    }
    const magnitude = Number(digits);
    return { id: this.alloc(), kind: "num", value: negative ? -magnitude : magnitude };
  }

  private readName(): string {
    const start = this.position();
    const first = this.peek();
    if (first === undefined || !isNameStart(first)) this.fail("Expected a name", start);
    let name = "";
    while (isNameChar(this.peek())) {
      const char = this.peek();
      if (char === undefined) break;
      name += char;
      this.bump(char);
    }
    return name;
  }

  private skipWs(): void {
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

  private alloc(): string {
    const id = `n${this.nextId}`;
    this.nextId += 1;
    return id;
  }

  private peek(): string | undefined {
    return this.source[this.index];
  }

  private bump(char: string): void {
    this.index += 1;
    if (char === "\n") {
      this.line += 1;
      this.column = 1;
      return;
    }
    this.column += 1;
  }

  private position(): SourcePosition {
    return { offset: this.index, line: this.line, column: this.column };
  }

  private fail(message: string, position: SourcePosition): never {
    throw new ParseFailure(message, position);
  }
}

function isBinary(name: string): name is BinaryKind {
  return BINARY.has(name as BinaryKind);
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

export function parse(source: string): ParseResult {
  try {
    return { ok: true, tree: new Parser(source).parseProgram() };
  } catch (error) {
    if (error instanceof ParseFailure) {
      return { ok: false, error: { message: error.message, position: error.position } };
    }
    throw error;
  }
}
