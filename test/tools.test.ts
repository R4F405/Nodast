import assert from "node:assert/strict";
import { test } from "node:test";
import { edit, find, open, printed, show } from "../src/tools.ts";

const SOURCE = "(let v0 5 (let v1 (add v0 70001) (let v2 (sub v1 70002) v2)))";

function session() {
  const opened = open(SOURCE);

  if (!opened.ok) throw new Error(opened.error);
  return opened;
}

test("opens a program and summarises it", () => {
  assert.equal(session().summary, "root n1, 11 nodes, type number");
  const broken = open("(add true 1)");
  assert.deepEqual(broken, { ok: false, error: "type-mismatch n1 expected number actual bool in (add true 1)" });
});

test("finds nodes by text, kind and name", () => {
  const { session: s } = session();
  assert.equal(find(s, { text: "70002" }), "n10 in n8:(sub ...): n10:70002");
  assert.equal(find(s, { text: "(add v0 70001)" }), "n4 in n3:(let v1 ...): n4:(add n5:v0 n6:70001)");
  assert.equal(find(s, { name: "v1" }), "n3 in n1:(let v0 ...): n3:(let v1 n4:(add n5:v0 n6:70001) n7:(let v2 n8:... n11:v2))\nn9 in n8:(sub ...): n9:v1");
  assert.equal(find(s, { kind: "sub", limit: 5 }), "n8 in n7:(let v2 ...): n8:(sub n9:v1 n10:70002)");
  assert.equal(find(s, { text: "42" }), "no match");
  assert.match(find(s, { kind: "let", limit: 1 }), /\n2 more; narrow the query$/);
});

test("shows a node folded below a depth", () => {
  const { session: s } = session();
  assert.equal(show(s, "n3", 1), "n3:(let v1 n4:(add n5:v0 n6:70001) n7:(let v2 n8:... n11:v2))");
  assert.equal(show(s, "n99"), "unknown-id n99");
});

test("edits in place and keeps the tree when an edit is rejected", () => {
  const { session: s } = session();
  assert.equal(edit(s, "(edits (replace n10 true))"), "rejected: type-mismatch n8 expected number actual bool in (sub v1 true)");
  assert.equal(edit(s, "(edits (replace n10 7))"), "ok, type number");
  assert.equal(printed(s), "const v0 = 5;\nconst v1 = v0 + 70001;\nconst v2 = v1 - 7;\nv2;\n");
});

test("wraps bare operations and explains the expected shape", () => {
  const { session: s } = session();
  assert.equal(edit(s, "(replace n10 7)"), "ok, type number");
  assert.equal(edit(s, " (replace n6 1) (replace n2 0)"), "ok, type number");
  assert.equal(printed(s), "const v0 = 0;\nconst v1 = v0 + 1;\nconst v2 = v1 - 7;\nv2;\n");
  assert.equal(edit(s, "[replace n2 1]"), "rejected: expected-edits, write one list like (edits (replace n4 7))");
});
