import assert from "node:assert/strict";
import { test } from "node:test";
import { compact, findNode, snippet } from "../src/compact.ts";
import { parse } from "../src/parse.ts";

test("prints compact text that parses back to the same text", () => {
  for (const source of ["(let x (add 1 2) x)", "(fn (a b) (lt a b))", "(if true -1 0)", "((fn (f) (f 1 2)) g)"]) {
    const parsed = parse(source);
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    assert.equal(compact(parsed.tree), source);
  }
});

test("prefixes every node with its id when asked", () => {
  const parsed = parse("(let x (sub 8 3) x)");
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(compact(parsed.tree, { ids: true }), "n1:(let x n2:(sub n3:8 n4:3) n5:x)");
  const node = findNode(parsed.tree, "n2");
  assert.ok(node);
  if (node) assert.equal(snippet(node), "(sub 8 3)");
  assert.equal(findNode(parsed.tree, "n9"), undefined);
});
