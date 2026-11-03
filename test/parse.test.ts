import assert from "node:assert/strict";
import { test } from "node:test";
import type { Expr } from "../src/ir.ts";
import { parse } from "../src/parse.ts";

function expectTree(source: string): Expr {
  const result = parse(source);
  if (!result.ok) {
    assert.fail(
      `${result.error.message} at ${result.error.position.line}:${result.error.position.column}`,
    );
  }
  return result.tree;
}

function expectError(source: string, message: string, line: number, column: number) {
  const result = parse(source);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.message, message);
  assert.equal(result.error.position.line, line);
  assert.equal(result.error.position.column, column);
}

test("parses add and assigns ids in preorder", () => {
  assert.deepEqual(expectTree("(add 1 2)"), {
    id: "n1",
    kind: "add",
    left: { id: "n2", kind: "num", value: 1 },
    right: { id: "n3", kind: "num", value: 2 },
  });
});

test("parses the other arithmetic and comparison forms", () => {
  assert.equal(expectTree("(sub 5 2)").kind, "sub");
  assert.equal(expectTree("(mul 5 2)").kind, "mul");
  assert.equal(expectTree("(div 5 2)").kind, "div");
  assert.equal(expectTree("(eq 5 2)").kind, "eq");
  assert.equal(expectTree("(lt 5 2)").kind, "lt");
  assert.equal(expectTree("(gt 5 2)").kind, "gt");
  assert.equal(expectTree("(lte 5 2)").kind, "lte");
  assert.equal(expectTree("(gte 5 2)").kind, "gte");
});

test("parses bools, names, and negative integers", () => {
  assert.deepEqual(expectTree("true"), { id: "n1", kind: "bool", value: true });
  assert.deepEqual(expectTree("false"), { id: "n1", kind: "bool", value: false });
  assert.deepEqual(expectTree("x"), { id: "n1", kind: "var", name: "x" });
  assert.deepEqual(expectTree("-3"), { id: "n1", kind: "num", value: -3 });
});

test("parses let, fn, call, and if", () => {
  assert.deepEqual(expectTree("(let x (add 1 2) x)"), {
    id: "n1",
    kind: "let",
    name: "x",
    value: {
      id: "n2",
      kind: "add",
      left: { id: "n3", kind: "num", value: 1 },
      right: { id: "n4", kind: "num", value: 2 },
    },
    body: { id: "n5", kind: "var", name: "x" },
  });

  assert.deepEqual(expectTree("(fn (x y) (add x y))"), {
    id: "n1",
    kind: "fn",
    params: ["x", "y"],
    body: {
      id: "n2",
      kind: "add",
      left: { id: "n3", kind: "var", name: "x" },
      right: { id: "n4", kind: "var", name: "y" },
    },
  });

  assert.equal(expectTree("(fn () 1)").kind, "fn");

  assert.deepEqual(expectTree("(f 1)"), {
    id: "n1",
    kind: "call",
    callee: { id: "n2", kind: "var", name: "f" },
    args: [{ id: "n3", kind: "num", value: 1 }],
  });

  assert.equal(expectTree("((fn (x) x) 1)").kind, "call");
  assert.equal(expectTree("(if (lt x 0) 0 x)").kind, "if");
});

test("ignores whitespace around forms", () => {
  assert.equal(expectTree("(\n  add   1\n  2\n)").kind, "add");
});

test("returns the same tree for the same source", () => {
  assert.deepEqual(expectTree("(let x 1 x)"), expectTree("  (let x 1 x)  "));
});

test("rejects an empty program", () => {
  expectError("", "Expected an expression", 1, 1);
  expectError("   ", "Expected an expression", 1, 4);
});

test("rejects trailing input", () => {
  expectError("(add 1 2) x", "Unexpected trailing input", 1, 11);
});

test("rejects an unclosed list at the opening parenthesis", () => {
  expectError("(add 1 2", "Unclosed '('", 1, 1);
});

test("rejects the wrong number of arguments at the operator", () => {
  expectError("(add 1)", "add expects 2 arguments, got 1", 1, 2);
  expectError("(if true 1)", "if expects 3 arguments, got 2", 1, 2);
});

test("rejects a reserved word used as a name", () => {
  expectError("(let add 1 add)", "add is a reserved word", 1, 6);
  expectError("(fn (let) 1)", "let is a reserved word", 1, 6);
});

test("rejects a duplicated parameter", () => {
  expectError("(fn (x x) x)", "Duplicate parameter x", 1, 8);
});

test("rejects a leading zero and an unexpected character", () => {
  expectError("01", "Leading zeros are not allowed", 1, 1);
  expectError("^", "Unexpected character '^'", 1, 1);
  expectError("(add 1 2) ^", "Unexpected trailing input", 1, 11);
});
