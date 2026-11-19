import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, run, type Model } from "../src/contract.ts";

function tail(prompt: string | undefined): string {
  const text = prompt ?? "";
  return text.slice(text.lastIndexOf("\ngoal: ") + 1);
}

test("accepts a program and prints it after the checker", async () => {
  const model = fixture(["(let x (add 1 2) x)"]);
  const result = await run({ goal: "bind the sum" }, model);
  assert.deepEqual(result, {
    ok: true,
    attempts: 1,
    source: "const x = 1 + 2;\nx;\n",
  });
  assert.equal(model.prompts.length, 1);
  assert.match(model.prompts[0] ?? "", /\(fn \(a b\) body\)/);
  assert.match(model.prompts[0] ?? "", /\(lt a b\)/);
  assert.equal(tail(model.prompts[0]), "goal: bind the sum\n");
  assert.doesNotMatch(model.prompts[0] ?? "", /edits/);
});

test("strips a fence and retries a rejected program", async () => {
  const model = fixture(["```\n(add true 1)\n```", "(add 1 2)"]);
  const result = await run({ goal: "bind the sum" }, model);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.attempts, 2);
  assert.equal(result.source, "1 + 2;\n");
  assert.equal(
    tail(model.prompts[1]),
    `goal: bind the sum

rejected:
(add true 1)
error:
type-mismatch n1 expected number actual bool in (add true 1)

Reply again with a corrected answer.
`,
  );
});

test("applies edits to the current program", async () => {
  const model = fixture(["(edits (replace n2 9) (replace n3 8))"]);
  const result = await run({ goal: "change both numbers", program: "(add 1 2)" }, model);
  assert.deepEqual(result, { ok: true, attempts: 1, source: "9 + 8;\n" });
  assert.match(model.prompts[0] ?? "", /program: n1:\(add n2:1 n3:2\)\n$/);
});

test("retries a rejected edit", async () => {
  const model = fixture(["(edits (replace n2 true))", "(edits (replace n2 9))"]);
  const result = await run({ goal: "change the left number", program: "(add 1 2)" }, model);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.source, "9 + 2;\n");
  assert.match(model.prompts[1] ?? "", /error:\ntype-mismatch n1 expected number actual bool in \(add true 2\)\n/);
});

test("inserts and deletes through the edit list", async () => {
  const inserted = await run(
    { goal: "add an argument", program: "(fn (f) (add (f 1) 0))" },
    fixture(["(edits (insert n3 1 2))"]),
  );
  assert.deepEqual(inserted, { ok: true, attempts: 1, source: "((f) => f(1, 2) + 0);\n" });
  const deleted = await run(
    { goal: "drop an argument", program: "(fn (f) (add (f 1 2) 0))" },
    fixture(["(edits (delete n6))"]),
  );
  assert.deepEqual(deleted, { ok: true, attempts: 1, source: "((f) => f(1) + 0);\n" });
});

test("stops at the attempt limit and keeps every rejection", async () => {
  const model = fixture(["(add true 1)", "(add false 1)", "(add 1 2)"]);
  const result = await run({ goal: "bind the sum" }, model, { attempts: 2 });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.error, {
    code: "type-mismatch",
    nodeId: "n1",
    expected: "number",
    actual: "bool",
  });
  assert.equal(model.prompts.length, 2);
  assert.match(model.prompts[1] ?? "", /rejected:\n\(add true 1\)/);
});

test("uses three attempts when no limit is given", async () => {
  const model = fixture(["(add true 1)", "(add true 1)", "(add 1 2)"]);
  const result = await run({ goal: "bind the sum" }, model);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.attempts, 3);
  assert.match(model.prompts[2] ?? "", /rejected:\n\(add true 1\)[\s\S]*rejected:\n\(add true 1\)/);
});

test("does not call the model when the current program is already invalid", async () => {
  const model = fixture(["(add 1 2)"]);
  const mismatched = await run({ goal: "keep it", program: "(add true 1)" }, model);
  assert.deepEqual(mismatched, {
    ok: false,
    attempts: 0,
    error: { code: "type-mismatch", nodeId: "n1", expected: "number", actual: "bool" },
  });
  const broken = await run({ goal: "keep it", program: "(add 1" }, model);
  assert.equal(broken.ok, false);
  if (broken.ok) return;
  assert.equal(broken.attempts, 0);
  assert.deepEqual(broken.error, { code: "parse", message: "Unclosed '('", line: 1, column: 1 });
  assert.deepEqual(model.prompts, []);
});

test("rejects the wrong response shape and an empty reply", async () => {
  const edits = await run({ goal: "bind the sum" }, fixture(["(edits (delete n1))"]), { attempts: 1 });
  assert.deepEqual(edits, { ok: false, attempts: 1, error: { code: "expected-program" } });
  const program = await run({ goal: "change it", program: "(add 1 2)" }, fixture(["(add 9 8)"]), { attempts: 1 });
  assert.deepEqual(program, { ok: false, attempts: 1, error: { code: "expected-edits" } });
  const empty = await run({ goal: "bind the sum" }, fixture(["  \n"]), { attempts: 1 });
  assert.deepEqual(empty, { ok: false, attempts: 1, error: { code: "empty-response" } });
});

test("stops when the model throws", async () => {
  const model: Model = {
    complete() {
      throw new Error("MiniMax 401");
    },
  };
  const result = await run({ goal: "bind the sum" }, model);
  assert.deepEqual(result, { ok: false, attempts: 1, error: { code: "model-error", message: "MiniMax 401" } });
});

test("renames a binding and its uses through the edit list", async () => {
  const model = fixture(["(edits (rename n1 scale))"]);
  const result = await run({ goal: "rename rate", program: "(let rate 3 (let rate_cap 7 (add rate rate_cap)))" }, model);
  assert.deepEqual(result, { ok: true, attempts: 1, source: "const scale = 3;\nconst rate_cap = 7;\nscale + rate_cap;\n" });
});

test("adds a parameter and updates every call through the edit list", async () => {
  const model = fixture(["(edits (param n1 k 1 2))"]);
  const result = await run({ goal: "widen f", program: "(let f (fn (x) (add x 1)) (add (f 1) (f 2)))" }, model);
  assert.deepEqual(result, { ok: true, attempts: 1, source: "const f = (x, k) => x + 1;\nf(1, 2) + f(2, 2);\n" });
});

test("a rejected rename keeps the program and says why", async () => {
  const model = fixture(["(edits (rename n1 rate_cap))", "(edits (rename n1 scale))"]);
  const result = await run({ goal: "rename rate", program: "(let rate 3 (let rate_cap 7 (add rate rate_cap)))" }, model);
  assert.equal(result.ok, true);
  assert.match(model.prompts[1] ?? "", /error:\nname rate_cap is already used at 0\n/);
});

test("ignores ids copied into expr", async () => {
  const model = fixture(["(edits (replace n1 n7:(sub n8:2 n9:1)))"]);
  const result = await run({ goal: "subtract", program: "(add 1 2)" }, model);
  assert.deepEqual(result, { ok: true, attempts: 1, source: "2 - 1;\n" });
});

test("sends the fixed instructions as system and the task as the user message", async () => {
  const seen: { prompt: string; system: string | undefined }[] = [];
  const model: Model = {
    complete(prompt, system) {
      seen.push({ prompt, system });
      return "(edits (replace n2 9))";
    },
  };
  await run({ goal: "change the left number", program: "(add 1 2)" }, model);
  assert.match(seen[0]?.system ?? "", /^Edit the Nodast program the user gives/);
  assert.match(seen[0]?.system ?? "", /\(rename id name\)/);
  assert.doesNotMatch(seen[0]?.system ?? "", /change the left number/);
  assert.equal(seen[0]?.prompt, "goal: change the left number\nprogram: n1:(add n2:1 n3:2)\n");
});

test("a scoped op that fails names the edit that failed", async () => {
  const model = fixture(["(edits (replace n2 4) (param n9 k 0 1))", "(edits (rename n7 y))", "(edits (rename n3 y))", "(edits (rename n1 y))"]);
  const result = await run({ goal: "rename x", program: "(let x 1 (add x 2))" }, model, { attempts: 4 });
  assert.equal(result.ok, true);
  assert.match(model.prompts[1] ?? "", /error:\nunknown-id n9 at 1\n/);
  assert.match(model.prompts[2] ?? "", /error:\nunknown-id n7 at 0\n/);
  assert.match(model.prompts[3] ?? "", /error:\nn3 is not a let or a bound use at 0\n/);
});

test("collapses a goal onto one line", async () => {
  const model = fixture(["1"]);
  await run({ goal: "bind\nthe sum" }, model);
  assert.match(model.prompts[0] ?? "", /goal: bind the sum\n/);
});
