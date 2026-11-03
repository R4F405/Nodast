import assert from "node:assert/strict";
import { test } from "node:test";
import { decode, encode, type BinaryError } from "../src/binary.ts";
import type { Expr } from "../src/ir.ts";
import { parse } from "../src/parse.ts";

function tree(source: string): Expr {
  const result = parse(source);
  if (!result.ok) assert.fail(result.error.message);
  return result.tree;
}

function roundTrip(source: string): Expr {
  const encoded = encode(tree(source));
  const decoded = decode(encoded);
  if (!decoded.ok) assert.fail(decoded.error.code);
  return decoded.tree;
}

function expectError(bytes: Uint8Array, error: BinaryError) {
  assert.deepEqual(decode(bytes), { ok: false, error });
}

const ADD = Uint8Array.from([
  0x4e, 0x44, 0x53, 0x31, 0x01, 0x03, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x6e, 0x31, 0x02, 0x00, 0x00, 0x00,
  0x6e, 0x32, 0x02, 0x00, 0x00, 0x00, 0x6e, 0x33, 0x03, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf0, 0x3f, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x40,
]);

test("encodes add as a flat little-endian buffer", () => {
  assert.deepEqual(encode(tree("(add 1 2)")), ADD);
  assert.deepEqual(encode(tree("(add 1 2)")), encode(tree("(add 1 2)")));
});

test("restores every form without parsing text", () => {
  for (const source of [
    "1",
    "-3",
    "true",
    "false",
    "x",
    "(sub 5 2)",
    "(mul 5 2)",
    "(div 5 2)",
    "(eq 1 1)",
    "(lt 1 2)",
    "(gt 1 2)",
    "(lte 1 2)",
    "(gte 1 2)",
    "(let x (add 1 2) x)",
    "(fn (x y) (add x y))",
    "(fn () 1)",
    "(f 1 2)",
    "(f)",
    "(if (lt x 0) 0 x)",
  ]) {
    assert.deepEqual(roundTrip(source), tree(source));
  }
});

test("rejects a buffer that is not a Nodast tree", () => {
  expectError(Uint8Array.from([0x00]), { code: "truncated" });
  expectError(Uint8Array.from([0x00, 0x00, 0x00, 0x00]), { code: "bad-magic" });
  expectError(ADD.subarray(0, 4), { code: "truncated" });
  expectError(ADD.subarray(0, 5), { code: "truncated" });
  const otherVersion = ADD.slice();
  otherVersion[4] = 2;
  expectError(otherVersion, { code: "bad-version", version: 2 });
  const unknown = ADD.slice();
  unknown[31] = 99;
  expectError(unknown, { code: "unknown-kind", kind: 99 });
  const trailing = new Uint8Array(ADD.length + 1);
  trailing.set(ADD);
  expectError(trailing, { code: "trailing" });
});
