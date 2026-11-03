import { parse } from "./parse.ts";

export type GrammarShape = "program" | "edits";

export type GrammarState = { stop: boolean; more: boolean };

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

const BINARY = new Set(["add", "sub", "mul", "div", "eq", "lt", "gt", "lte", "gte"]);
const EDIT_OPS = ["replace", "insert", "delete"];

const PROBES = [
  " ",
  "\t",
  "\n",
  "\r",
  "(",
  ")",
  "-",
  ..."0123456789",
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "_",
];

type Flag = "ok" | "partial" | "bad";

export function grammar(source: string, shape: GrammarShape): GrammarState {
  if (classify(source, shape) === "bad") return { stop: false, more: false };
  const stop = shape === "program" ? parse(source).ok : classify(source, shape) === "ok";
  const more = PROBES.some((char) => classify(source + char, shape) !== "bad");
  return { stop, more };
}

export function allows(source: string, shape: GrammarShape, next: string): boolean {
  return classify(source + next, shape) !== "bad";
}

function classify(source: string, shape: GrammarShape): Flag {
  const scan = new Scan(source);
  const flag = shape === "program" ? scan.program() : scan.edits();
  return flag;
}

class Scan {
  private readonly source: string;
  private index = 0;

  constructor(source: string) {
    this.source = source;
  }

  program(): Flag {
    this.skipWs();
    if (this.eof()) return "partial";
    const expr = this.expr();
    if (expr !== "ok") return expr;
    this.skipWs();
    if (!this.eof()) return "bad";
    return "ok";
  }

  edits(): Flag {
    this.skipWs();
    if (this.eof()) return "partial";
    if (this.peek() !== "(") return "bad";
    this.bump();
    const head = this.keyword("edits");
    if (head.flag !== "ok") return head.flag;
    for (;;) {
      this.skipWs();
      if (this.eof()) return "partial";
      if (this.peek() === ")") {
        this.bump();
        break;
      }
      const edit = this.edit();
      if (edit !== "ok") return edit;
    }
    this.skipWs();
    if (!this.eof()) return "bad";
    return "ok";
  }

  private expr(): Flag {
    this.skipWs();
    if (this.eof()) return "partial";
    if (this.peek() === "(") return this.list();
    if (this.peek() === "-" || isDigit(this.peek())) return this.number();
    if (isNameStart(this.peek())) return this.nameExpr();
    return "bad";
  }

  private list(): Flag {
    this.bump();
    this.skipWs();
    if (this.eof()) return "partial";
    if (this.peek() === ")") return "bad";
    if (!isNameStart(this.peek())) {
      const callee = this.expr();
      if (callee !== "ok") return callee;
      return this.args();
    }
    const head = this.readName();
    if (!head.ended) return "partial";
    if (head.name === "let") return this.letRest();
    if (head.name === "fn") return this.fnRest();
    if (head.name === "if") return this.fixedArgs(3);
    if (BINARY.has(head.name)) return this.fixedArgs(2);
    return this.args();
  }

  private letRest(): Flag {
    this.skipWs();
    if (this.eof()) return "partial";
    if (!isNameStart(this.peek())) return "bad";
    const name = this.readName();
    if (!name.ended) return "partial";
    if (RESERVED.has(name.name)) return "bad";
    return this.fixedArgs(2);
  }

  private fnRest(): Flag {
    this.skipWs();
    if (this.eof()) return "partial";
    if (this.peek() !== "(") return "bad";
    this.bump();
    const seen = new Set<string>();
    for (;;) {
      this.skipWs();
      if (this.eof()) return "partial";
      if (this.peek() === ")") {
        this.bump();
        break;
      }
      if (!isNameStart(this.peek())) return "bad";
      const name = this.readName();
      if (!name.ended) return "partial";
      if (RESERVED.has(name.name) || seen.has(name.name)) return "bad";
      seen.add(name.name);
    }
    return this.fixedArgs(1);
  }

  private fixedArgs(count: number): Flag {
    let seen = 0;
    for (;;) {
      this.skipWs();
      if (this.eof()) return "partial";
      if (this.peek() === ")") {
        this.bump();
        return seen === count ? "ok" : "bad";
      }
      if (seen === count) return "bad";
      const arg = this.expr();
      if (arg !== "ok") return arg;
      seen += 1;
    }
  }

  private args(): Flag {
    for (;;) {
      this.skipWs();
      if (this.eof()) return "partial";
      if (this.peek() === ")") {
        this.bump();
        return "ok";
      }
      const arg = this.expr();
      if (arg !== "ok") return arg;
    }
  }

  private edit(): Flag {
    this.skipWs();
    if (this.eof()) return "partial";
    if (this.peek() !== "(") return "bad";
    this.bump();
    const op = this.oneOf(EDIT_OPS);
    if (op.flag !== "ok" || op.name === undefined) return op.flag;
    this.skipWs();
    if (this.eof()) return "partial";
    if (!isNameStart(this.peek())) return "bad";
    const id = this.readName();
    if (!id.ended) return "partial";
    if (op.name === "delete") return this.close();
    if (op.name === "insert") {
      const index = this.indexNum();
      if (index !== "ok") return index;
    }
    const expr = this.expr();
    if (expr !== "ok") return expr;
    return this.close();
  }

  private keyword(expected: string): { flag: Flag; name?: string } {
    return this.oneOf([expected]);
  }

  private oneOf(options: readonly string[]): { flag: Flag; name?: string } {
    this.skipWs();
    if (this.eof()) return { flag: "partial" };
    if (!isNameStart(this.peek())) return { flag: "bad" };
    const name = this.readName();
    if (options.includes(name.name)) return { flag: "ok", name: name.name };
    if (!name.ended && options.some((option) => option.startsWith(name.name))) return { flag: "partial" };
    return { flag: "bad" };
  }

  private indexNum(): Flag {
    this.skipWs();
    if (this.eof()) return "partial";
    if (!isDigit(this.peek())) return "bad";
    if (this.peek() === "0") {
      this.bump();
      if (isDigit(this.peek())) return "bad";
      return "ok";
    }
    while (isDigit(this.peek())) this.bump();
    return "ok";
  }

  private number(): Flag {
    if (this.peek() === "-") {
      this.bump();
      if (this.eof()) return "partial";
      if (!isDigit(this.peek())) return "bad";
    }
    if (this.peek() === "0") {
      this.bump();
      if (isDigit(this.peek())) return "bad";
      return "ok";
    }
    if (!isDigit(this.peek())) return "bad";
    while (isDigit(this.peek())) this.bump();
    return "ok";
  }

  private nameExpr(): Flag {
    const name = this.readName();
    if (!name.ended) return "partial";
    if (name.name === "true" || name.name === "false") return "ok";
    if (RESERVED.has(name.name)) return "bad";
    return "ok";
  }

  private close(): Flag {
    this.skipWs();
    if (this.eof()) return "partial";
    if (this.peek() !== ")") return "bad";
    this.bump();
    return "ok";
  }

  private readName(): { name: string; ended: boolean } {
    let name = "";
    while (isNameChar(this.peek())) {
      const char = this.peek();
      if (char === undefined) break;
      name += char;
      this.bump();
    }
    return { name, ended: !this.eof() };
  }

  private skipWs(): void {
    for (;;) {
      const char = this.peek();
      if (char === " " || char === "\t" || char === "\n") {
        this.bump();
        continue;
      }
      if (char === "\r") {
        this.bump();
        if (this.peek() === "\n") this.bump();
        continue;
      }
      return;
    }
  }

  private eof(): boolean {
    return this.index >= this.source.length;
  }

  private peek(): string | undefined {
    return this.source[this.index];
  }

  private bump(): void {
    this.index += 1;
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
