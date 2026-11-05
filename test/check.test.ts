import assert from "node:assert/strict";
import { test } from "node:test";
import { check, type CheckError } from "../src/check.ts";
import type { Expr } from "../src/ir.ts";
import { parse } from "../src/parse.ts";

function tree(source: string): Expr {
  const result = parse(source);
  if (!result.ok) assert.fail(result.error.message);
  return result.tree;
}

function expectType(source: string, type: string) {
  const result = check(tree(source));
  if (!result.ok) assert.fail(JSON.stringify(result.error));
  assert.equal(result.type, type);
}

function expectError(source: string, error: CheckError) {
  const result = check(tree(source));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, error);
}

test("types literals, arithmetic, comparisons, and if", () => {
  expectType("1", "number");
  expectType("true", "bool");
  expectType("(add 1 2)", "number");
  expectType("(sub 5 2)", "number");
  expectType("(mul 5 2)", "number");
  expectType("(div 5 2)", "number");
  expectType("(lt 1 2)", "bool");
  expectType("(eq true false)", "bool");
  expectType("(eq 1 1)", "bool");
  expectType("(if true 1 2)", "number");
  expectType("(if false true false)", "bool");
});

test("types let and functions from their body", () => {
  expectType("(let x 1 (add x 2))", "number");
  expectType("(let x true (if x 1 2))", "number");
  expectType("(let x 1 (let x true x))", "bool");
  expectType("(fn (x) (add x 1))", "(number) -> number");
  expectType("(fn (x y) (lt x y))", "(number, number) -> bool");
  expectType("(fn () 1)", "() -> number");
  expectType("(let f (fn (x) (add x 1)) (f 2))", "number");
  expectType("(let f (fn (x) (lt x 0)) (if (f 1) 1 0))", "number");
  expectType("(let x true (fn (x) (add x 1)))", "(number) -> number");
  expectType("(let apply (fn (f) (f 1)) (apply (fn (x) (add x 1))))", "number");
});

test("rejects a duplicated node id", () => {
  const expr: Expr = {
    id: "n1",
    kind: "add",
    left: { id: "n1", kind: "num", value: 1 },
    right: { id: "n2", kind: "num", value: 2 },
  };
  const result = check(expr);
  assert.deepEqual(result, { ok: false, error: { code: "duplicate-id", nodeId: "n1" } });
});

test("rejects a name used outside its binding", () => {
  expectError("(add x 1)", { code: "undefined-name", nodeId: "n2", name: "x" });
  expectError("(let x (add x 1) x)", { code: "undefined-name", nodeId: "n3", name: "x" });
  expectError("(fn (x) y)", { code: "undefined-name", nodeId: "n2", name: "y" });
});

test("rejects types that do not line up", () => {
  expectError("(add true 1)", {
    code: "type-mismatch",
    nodeId: "n1",
    expected: "number",
    actual: "bool",
  });
  expectError("(if 1 1 2)", {
    code: "type-mismatch",
    nodeId: "n1",
    expected: "bool",
    actual: "number",
  });
  expectError("(if true 1 false)", {
    code: "type-mismatch",
    nodeId: "n1",
    expected: "number",
    actual: "bool",
  });
  expectError("(eq 1 true)", {
    code: "type-mismatch",
    nodeId: "n1",
    expected: "number",
    actual: "bool",
  });
  expectError("(let f (fn (x) (add x 1)) (f true))", {
    code: "type-mismatch",
    nodeId: "n6",
    expected: "number",
    actual: "bool",
  });
  expectError("(let f (fn (x) (add x 1)) (add f 1))", {
    code: "type-mismatch",
    nodeId: "n6",
    expected: "number",
    actual: "(number) -> number",
  });
});

test("rejects a call that is not a function or has the wrong arity", () => {
  expectError("(let f 1 (f))", { code: "not-a-function", nodeId: "n3", actual: "number" });
  expectError("(let f (fn (x) 1) (f))", {
    code: "arity-mismatch",
    nodeId: "n4",
    expected: 1,
    actual: 0,
  });
  expectError("(fn (x) (x x))", { code: "infinite-type", nodeId: "n2", name: "x" });
});

test("keeps a type that never becomes concrete as a type variable", () => {
  expectType("(fn (x) x)", "(a) -> a");
  expectType("(fn (x) 1)", "(a) -> number");
  expectType("(fn (x y) (eq x y))", "(a, a) -> bool");
  expectType("(fn (f) (f 5))", "((number) -> a) -> a");
  expectType("(fn (f x) (f (f x)))", "((a) -> a, a) -> a");
});

test("lets a let-bound function be used at several types", () => {
  expectType("(let id (fn (x) x) (if (id true) (id 1) 2))", "number");
  expectType("(let apply (fn (f x) (f x)) (apply (fn (b) (if b 1 0)) (apply (fn (n) (lt n 3)) 2)))", "number");
  expectType("(let same (fn (x y) (eq x y)) (if (same true false) (same 1 2) false))", "bool");
});

test("keeps parameters monomorphic and the eq constraint on copies", () => {
  expectError("(fn (f) (if (f true) (f 1) 2))", { code: "type-mismatch", nodeId: "n6", expected: "bool", actual: "number" });
  expectError("(let same (fn (x y) (eq x y)) (same (fn (a) a) (fn (b) b)))", {
    code: "type-mismatch",
    nodeId: "n6",
    expected: "number | bool",
    actual: "(a) -> a",
  });
});
