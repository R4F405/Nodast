import assert from "node:assert/strict";
import { test } from "node:test";
import { change, edit, find, open, printed, show, view } from "../src/tools.ts";

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
  assert.equal(edit(s, "(edits (replace n10 7))"), "ok, type number, now n8:(sub n9:v1 n12:7)");
  assert.equal(printed(s), "const v0 = 5;\nconst v1 = v0 + 70001;\nconst v2 = v1 - 7;\nv2;\n");
});

test("wraps bare operations and explains the expected shape", () => {
  const { session: s } = session();
  assert.equal(edit(s, "(replace n10 7)"), "ok, type number, now n8:(sub n9:v1 n12:7)");
  assert.equal(
    edit(s, " (replace n6 1) (replace n2 0)"),
    "ok, type number, now n4:(add n5:v0 n13:1) n1:(let v0 n14:0 n3:(let v1 n4:... n7:...))",
  );
  assert.equal(printed(s), "const v0 = 0;\nconst v1 = v0 + 1;\nconst v2 = v1 - 7;\nv2;\n");
  assert.equal(edit(s, "[replace n2 1]"), "rejected: expected-edits, write one list like (edits (replace n4 7))");
});

test("ignores blank query fields and names unknown kinds", () => {
  const { session: s } = session();
  assert.equal(find(s, { text: "70002", kind: "", name: " " }), "n10 in n8:(sub ...): n10:70002");
  assert.equal(find(s, { text: "", kind: "", name: "" }), "empty query; give text, kind or name");
  assert.match(find(s, { text: "70002", kind: "number" }), /^unknown kind number; kinds are num bool /);
});

test("applies one edit given as separate fields", () => {
  const { session: s } = session();
  assert.equal(change(s, { id: "n10", expr: "7" }), "ok, type number, now n8:(sub n9:v1 n12:7)");
  assert.equal(change(s, { op: "replace", id: "n8", expr: "(add v1 7)" }), "ok, type number, now n7:(let v2 n13:(add n14:v1 n15:7) n11:v2)");
  assert.equal(change(s, { id: "n6" }), "rejected: replace needs expr");
  assert.equal(change(s, { op: "insert", id: "n4", expr: "1" }), "rejected: insert needs index");
  assert.match(change(s, { op: "move", id: "n4", expr: "1" }), /^rejected: unknown op move/);
  assert.equal(printed(s), "const v0 = 5;\nconst v1 = v0 + 70001;\nconst v2 = v1 + 7;\nv2;\n");
});

test("renames a binding and only the uses that resolve to it", () => {
  const opened = open("(let rate 3 (let rate_cap 7 (let a (mul rate 2) (let b (fn (rate) (add rate rate_cap)) (b a)))))");
  if (!opened.ok) throw new Error(opened.error);
  const s = opened.session;
  assert.equal(change(s, { op: "rename", id: "n1", expr: "scale" }), "ok, type number, renamed rate to scale and 1 uses");
  assert.equal(
    printed(s),
    "const scale = 3;\nconst rate_cap = 7;\nconst a = scale * 2;\nconst b = (rate) => rate + rate_cap;\nb(a);\n",
  );
  assert.equal(change(s, { op: "rename", id: "n7", expr: "x" }), "ok, type number, renamed scale to x and 1 uses");
  assert.equal(change(s, { op: "rename", id: "n1", expr: "a" }), "rejected: name a is already used");
  assert.equal(change(s, { op: "rename", id: "n2", expr: "y" }), "rejected: n2 is not a let or a bound use");
  assert.equal(change(s, { op: "rename", id: "n1", expr: "let" }), "rejected: bad name let");
});

test("adds a parameter and passes an argument at every call", () => {
  const opened = open("(let step (fn (x) (add x 3)) (let a (step 1) (let b (step a) (let step 0 (add b step)))))");
  if (!opened.ok) throw new Error(opened.error);
  const s = opened.session;
  assert.equal(change(s, { op: "param", id: "n1", name: "k", expr: "2" }), "ok, type number, step takes (x k), updated 2 calls");
  assert.equal(
    printed(s),
    "const step = (x, k) => x + 3;\nconst a = step(1, 2);\nconst b = step(a, 2);\n(() => {\n  const step = 0;\n  return b + step;\n})();\n",
  );
  assert.equal(change(s, { op: "param", id: "n1", name: "j", expr: "true", index: 0 }), "ok, type number, step takes (j x k), updated 2 calls");
  assert.equal(change(s, { op: "param", id: "n1", name: "x", expr: "1" }), "rejected: name x is already used in step");
  assert.equal(change(s, { op: "param", id: "n1", name: "m", expr: "1", index: 9 }), "rejected: index 9 is outside 0..3");
  assert.equal(change(s, { op: "param", id: "n1", expr: "1" }), "rejected: param needs name");
});

test("refuses a parameter when the function is also passed as a value", () => {
  const opened = open("(let f (fn (x) x) (let g (fn (h) (h 1)) (add (f 2) (g f))))");
  if (!opened.ok) throw new Error(opened.error);
  assert.match(change(opened.session, { op: "param", id: "n1", name: "y", expr: "0" }), /^rejected: f is also used as a value at n\d+/);
});

test("never reuses an id the session handed out", () => {
  const { session: s } = session();
  edit(s, "(replace n10 7)");
  edit(s, "(replace n12 8)");
  assert.equal(show(s, "n8", 1), "n8:(sub n9:v1 n13:8)");
  assert.equal(show(s, "n12"), "unknown-id n12");
});

test("shows a small program whole and hides a large one", () => {
  const { session: s } = session();
  assert.equal(
    view(s, 11),
    "n1:(let v0 n2:5\nn3:(let v1 n4:(add n5:v0 n6:70001)\nn7:(let v2 n8:(sub n9:v1 n10:70002)\nn11:v2)))",
  );
  assert.equal(view(s, 10), undefined);
});
