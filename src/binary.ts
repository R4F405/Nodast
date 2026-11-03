import type { Expr } from "./ir.ts";

export type BinaryError =
  | { code: "truncated" }
  | { code: "bad-magic" }
  | { code: "bad-version"; version: number }
  | { code: "unknown-kind"; kind: number }
  | { code: "bad-string" }
  | { code: "trailing" };

export type BinaryResult = { ok: true; tree: Expr } | { ok: false; error: BinaryError };

const MAGIC = [0x4e, 0x44, 0x53, 0x31] as const;
const VERSION = 1;

const KIND_CODE = {
  num: 0,
  bool: 1,
  var: 2,
  add: 3,
  sub: 4,
  mul: 5,
  div: 6,
  eq: 7,
  lt: 8,
  gt: 9,
  lte: 10,
  gte: 11,
  let: 12,
  fn: 13,
  call: 14,
  if: 15,
} as const;

class BinaryFailure extends Error {
  readonly detail: BinaryError;

  constructor(detail: BinaryError) {
    super(detail.code);
    this.name = "BinaryFailure";
    this.detail = detail;
  }
}

class Writer {
  private readonly bytes: number[] = [];

  u8(value: number): void {
    this.bytes.push(value & 0xff);
  }

  u32(value: number): void {
    this.u8(value);
    this.u8(value >> 8);
    this.u8(value >> 16);
    this.u8(value >> 24);
  }

  f64(value: number): void {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, true);
    for (const byte of new Uint8Array(buffer)) this.u8(byte);
  }

  raw(bytes: Uint8Array): void {
    for (const byte of bytes) this.u8(byte);
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

class Reader {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private offset = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  u8(): number {
    if (this.offset >= this.bytes.length) throw new BinaryFailure({ code: "truncated" });
    const value = this.bytes[this.offset];
    this.offset += 1;
    if (value === undefined) throw new BinaryFailure({ code: "truncated" });
    return value;
  }

  u32(): number {
    if (this.offset + 4 > this.bytes.length) throw new BinaryFailure({ code: "truncated" });
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  f64(): number {
    if (this.offset + 8 > this.bytes.length) throw new BinaryFailure({ code: "truncated" });
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  raw(length: number): Uint8Array {
    if (this.offset + length > this.bytes.length) throw new BinaryFailure({ code: "truncated" });
    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }

  done(): boolean {
    return this.offset === this.bytes.length;
  }
}

export function encode(expr: Expr): Uint8Array {
  const strings: string[] = [];
  const index = new Map<string, number>();
  collect(expr, strings, index);
  const writer = new Writer();
  for (const byte of MAGIC) writer.u8(byte);
  writer.u8(VERSION);
  writer.u32(strings.length);
  const encoder = new TextEncoder();
  for (const value of strings) {
    const raw = encoder.encode(value);
    writer.u32(raw.length);
    writer.raw(raw);
  }
  writer.u32(countNodes(expr));
  writeNode(expr, writer, index);
  return writer.finish();
}

export function decode(bytes: Uint8Array): BinaryResult {
  try {
    const reader = new Reader(bytes);
    const magic = [reader.u8(), reader.u8(), reader.u8(), reader.u8()];
    if (magic.some((byte, index) => byte !== MAGIC[index])) return { ok: false, error: { code: "bad-magic" } };
    const version = reader.u8();
    if (version !== VERSION) return { ok: false, error: { code: "bad-version", version } };
    const stringCount = reader.u32();
    const decoder = new TextDecoder();
    const strings: string[] = [];
    for (let i = 0; i < stringCount; i += 1) strings.push(decoder.decode(reader.raw(reader.u32())));
    const nodeCount = reader.u32();
    let seen = 0;
    const readNode = (): Expr => {
      if (seen >= nodeCount) throw new BinaryFailure({ code: "truncated" });
      seen += 1;
      const kind = reader.u8();
      const id = stringAt(strings, reader.u32());
      switch (kind) {
        case KIND_CODE.num:
          return { id, kind: "num", value: reader.f64() };
        case KIND_CODE.bool:
          return { id, kind: "bool", value: reader.u8() !== 0 };
        case KIND_CODE.var:
          return { id, kind: "var", name: stringAt(strings, reader.u32()) };
        case KIND_CODE.add:
        case KIND_CODE.sub:
        case KIND_CODE.mul:
        case KIND_CODE.div:
        case KIND_CODE.eq:
        case KIND_CODE.lt:
        case KIND_CODE.gt:
        case KIND_CODE.lte:
        case KIND_CODE.gte:
          return { id, kind: kindName(kind), left: readNode(), right: readNode() };
        case KIND_CODE.let:
          return { id, kind: "let", name: stringAt(strings, reader.u32()), value: readNode(), body: readNode() };
        case KIND_CODE.fn: {
          const count = reader.u32();
          const params: string[] = [];
          for (let i = 0; i < count; i += 1) params.push(stringAt(strings, reader.u32()));
          return { id, kind: "fn", params, body: readNode() };
        }
        case KIND_CODE.call: {
          const count = reader.u32();
          const callee = readNode();
          const args: Expr[] = [];
          for (let i = 0; i < count; i += 1) args.push(readNode());
          return { id, kind: "call", callee, args };
        }
        case KIND_CODE.if:
          return { id, kind: "if", cond: readNode(), then: readNode(), else: readNode() };
        default:
          throw new BinaryFailure({ code: "unknown-kind", kind });
      }
    };
    const tree = readNode();
    if (seen !== nodeCount) throw new BinaryFailure({ code: "truncated" });
    if (!reader.done()) throw new BinaryFailure({ code: "trailing" });
    return { ok: true, tree };
  } catch (error) {
    if (error instanceof BinaryFailure) return { ok: false, error: error.detail };
    throw error;
  }
}

function kindName(kind: number): "add" | "sub" | "mul" | "div" | "eq" | "lt" | "gt" | "lte" | "gte" {
  switch (kind) {
    case KIND_CODE.add:
      return "add";
    case KIND_CODE.sub:
      return "sub";
    case KIND_CODE.mul:
      return "mul";
    case KIND_CODE.div:
      return "div";
    case KIND_CODE.eq:
      return "eq";
    case KIND_CODE.lt:
      return "lt";
    case KIND_CODE.gt:
      return "gt";
    case KIND_CODE.lte:
      return "lte";
    case KIND_CODE.gte:
      return "gte";
    default:
      throw new BinaryFailure({ code: "unknown-kind", kind });
  }
}

function stringAt(strings: readonly string[], index: number): string {
  const value = strings[index];
  if (value === undefined) throw new BinaryFailure({ code: "bad-string" });
  return value;
}

function collect(expr: Expr, strings: string[], index: Map<string, number>): void {
  intern(strings, index, expr.id);
  switch (expr.kind) {
    case "num":
    case "bool":
      return;
    case "var":
      intern(strings, index, expr.name);
      return;
    case "add":
    case "sub":
    case "mul":
    case "div":
    case "eq":
    case "lt":
    case "gt":
    case "lte":
    case "gte":
      collect(expr.left, strings, index);
      collect(expr.right, strings, index);
      return;
    case "let":
      intern(strings, index, expr.name);
      collect(expr.value, strings, index);
      collect(expr.body, strings, index);
      return;
    case "fn":
      for (const param of expr.params) intern(strings, index, param);
      collect(expr.body, strings, index);
      return;
    case "call":
      collect(expr.callee, strings, index);
      for (const arg of expr.args) collect(arg, strings, index);
      return;
    case "if":
      collect(expr.cond, strings, index);
      collect(expr.then, strings, index);
      collect(expr.else, strings, index);
      return;
  }
}

function writeNode(expr: Expr, writer: Writer, index: Map<string, number>): void {
  writer.u8(KIND_CODE[expr.kind]);
  writer.u32(must(index, expr.id));
  switch (expr.kind) {
    case "num":
      writer.f64(expr.value);
      return;
    case "bool":
      writer.u8(expr.value ? 1 : 0);
      return;
    case "var":
      writer.u32(must(index, expr.name));
      return;
    case "add":
    case "sub":
    case "mul":
    case "div":
    case "eq":
    case "lt":
    case "gt":
    case "lte":
    case "gte":
      writeNode(expr.left, writer, index);
      writeNode(expr.right, writer, index);
      return;
    case "let":
      writer.u32(must(index, expr.name));
      writeNode(expr.value, writer, index);
      writeNode(expr.body, writer, index);
      return;
    case "fn":
      writer.u32(expr.params.length);
      for (const param of expr.params) writer.u32(must(index, param));
      writeNode(expr.body, writer, index);
      return;
    case "call":
      writer.u32(expr.args.length);
      writeNode(expr.callee, writer, index);
      for (const arg of expr.args) writeNode(arg, writer, index);
      return;
    case "if":
      writeNode(expr.cond, writer, index);
      writeNode(expr.then, writer, index);
      writeNode(expr.else, writer, index);
      return;
  }
}

function countNodes(expr: Expr): number {
  let count = 1;
  for (const child of children(expr)) count += countNodes(child);
  return count;
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

function intern(strings: string[], index: Map<string, number>, value: string): void {
  if (index.has(value)) return;
  index.set(value, strings.length);
  strings.push(value);
}

function must(index: Map<string, number>, value: string): number {
  const found = index.get(value);
  if (found === undefined) throw new BinaryFailure({ code: "bad-string" });
  return found;
}
