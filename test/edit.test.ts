import assert from "node:assert/strict";
import { test } from "node:test";
import { check } from "../src/check.ts";
import { applyEdits, type EditError } from "../src/edit.ts";
import type { Expr } from "../src/ir.ts";
import { parse } from "../src/parse.ts";
import { print } from "../src/print.ts";

function tree(source: string): Expr {
  const result = parse(source);
  if (!result.ok) assert.fail(result.error.message);
  return result.tree;
}

function expectTree(source: string, edits: Parameters<typeof applyEdits>[1]): Expr {
  const result = applyEdits(tree(source), edits);
  if (!result.ok) assert.fail(JSON.stringify(result.error));
  return result.tree;
}

function expectError(source: string, edits: Parameters<typeof applyEdits>[1], error: EditError) {
  const result = applyEdits(tree(source), edits);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.error, error);
}

test("replaces a node and can reuse its id", () => {
  const next = expectTree("(add 1 2)", [
    { op: "replace", id: "n2", node: { id: "n2", kind: "num", value: 9 } },
  ]);
  assert.equal(print(next), "9 + 2;\n");
  assert.deepEqual(check(next), { ok: true, type: "number" });
});

test("replaces the root", () => {
  const next = expectTree("(add 1 2)", [
    { op: "replace", id: "n1", node: { id: "n9", kind: "num", value: 4 } },
  ]);
  assert.equal(print(next), "4;\n");
});

test("inserts and deletes call arguments", () => {
  const inserted = expectTree("(f 1)", [
    { op: "insert", id: "n1", index: 1, node: { id: "n4", kind: "num", value: 2 } },
  ]);
  assert.equal(print(inserted), "f(1, 2);\n");

  const deleted = expectTree("(f 1 2)", [{ op: "delete", id: "n3" }]);
  assert.equal(print(deleted), "f(2);\n");
});

test("applies a batch in order", () => {
  const next = expectTree("(f 1)", [
    { op: "insert", id: "n1", index: 1, node: { id: "n4", kind: "num", value: 2 } },
    { op: "delete", id: "n3" },
  ]);
  assert.equal(print(next), "f(2);\n");
});

test("keeps the previous tree when a later edit fails", () => {
  const input = tree("(add 1 2)");
  const snapshot = structuredClone(input);
  const result = applyEdits(input, [
    { op: "replace", id: "n2", node: { id: "n9", kind: "num", value: 9 } },
    { op: "delete", id: "missing" },
  ]);
  assert.deepEqual(result, { ok: false, error: { code: "unknown-id", id: "missing", at: 1 } });
  assert.deepEqual(input, snapshot);
});

test("does not mutate the input tree", () => {
  const input = tree("(add 1 2)");
  const snapshot = structuredClone(input);
  const result = applyEdits(input, [
    { op: "replace", id: "n2", node: { id: "n2", kind: "num", value: 9 } },
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(input, snapshot);
  if (result.ok) assert.notEqual(result.tree, input);
});

test("rejects edits that would break the tree", () => {
  expectError("(add 1 2)", [{ op: "delete", id: "n2" }], { code: "cannot-delete", id: "n2", at: 0 });
  expectError("(f 1)", [{ op: "delete", id: "n2" }], { code: "cannot-delete", id: "n2", at: 0 });
  expectError("(add 1 2)", [{ op: "insert", id: "n1", index: 0, node: { id: "n9", kind: "num", value: 3 } }], {
    code: "cannot-insert",
    id: "n1",
    at: 0,
  });
  expectError("(f 1)", [{ op: "insert", id: "n1", index: 2, node: { id: "n9", kind: "num", value: 3 } }], {
    code: "index-out-of-range",
    id: "n1",
    at: 0,
    index: 2,
    length: 1,
  });
  expectError("(add 1 2)", [{ op: "replace", id: "n2", node: { id: "n3", kind: "num", value: 9 } }], {
    code: "duplicate-id",
    id: "n3",
    at: 0,
  });
  expectError("(add 1 2)", [{ op: "replace", id: "missing", node: { id: "n9", kind: "num", value: 1 } }], {
    code: "unknown-id",
    id: "missing",
    at: 0,
  });
});
