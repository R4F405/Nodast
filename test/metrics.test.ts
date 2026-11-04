import assert from "node:assert/strict";
import { test } from "node:test";
import { chain, editTasks, expectedAfter, judge, lexicalTokens, payload, plainVerdict } from "../bench/metrics.ts";
import { compact } from "../src/compact.ts";
import { parse } from "../src/parse.ts";

test("counts the same kind of token on compact text and printed code", () => {
  const sample = payload("(let x (add 1 2) x)");
  assert.equal(sample.printed, "const x = 1 + 2;\nx;\n");
  assert.equal(sample.compactTokens, lexicalTokens("(let x (add 1 2) x)"));
  assert.equal(sample.printedTokens, lexicalTokens(sample.printed));
  assert.ok(sample.bufferBytes > 0);
});

test("accepts executable typescript and rejects syntax and type errors", () => {
  assert.deepEqual(plainVerdict("const x = 1 + 2;\nx;\n"), { ok: true });
  assert.equal(plainVerdict("const x = ;").ok, false);
  assert.equal(plainVerdict('const x: number = "a";\nx;\n').ok, false);
  const crashed = plainVerdict("null.toString();\n");
  assert.equal(crashed.ok, false);
  if (!crashed.ok) assert.match(crashed.error, /TypeError/);
});

test("judges the value of the last expression", () => {
  assert.equal(judge("const x = 1 + 2;\nx;\n", { value: 3 }), null);
  assert.match(judge("const x = 1;\nx;\n", { value: 3 }) ?? "", /expected 3 got 1/);
  assert.equal(judge("((a, b) => a < b);\n", { calls: [["1, 2", true], ["2, 1", false]] }), null);
  assert.match(judge("((a, b) => a > b);\n", { calls: [["1, 2", true]] }) ?? "", /expected true got false/);
  assert.match(judge("function f(n: number) { return n; }\n", { calls: [["1", 1]] }) ?? "", /expected a function/);
  assert.match(judge("1;\n", { value: true }) ?? "", /expected true got 1/);
});

test("builds an edit chain whose edits change the result", () => {
  assert.equal(
    chain(4),
    "(let v0 5 (let v1 (add v0 70001) (let v2 (sub v1 70002) (let v3 (add v2 70003) (let v4 (sub v3 70004) v4)))))",
  );
  for (const length of [50, 500]) {
    const source = chain(length);
    const untouched = expectedAfter({ goal: "none", from: "(let v0 5", to: "(let v0 5" }, source);
    const tasks = editTasks(length);
    assert.equal(tasks.length, 3);
    for (const task of tasks) assert.notEqual(expectedAfter(task, source), untouched);
  }
});

test("lays out each let body on its own line", () => {
  const parsed = parse(chain(2));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(
    compact(parsed.tree, { ids: true, layout: "lines" }),
    "n1:(let v0 n2:5\nn3:(let v1 n4:(add n5:v0 n6:70001)\nn7:(let v2 n8:(sub n9:v1 n10:70002)\nn11:v2)))",
  );
});

test("keeps model code away from host objects", () => {
  assert.match(judge("console.log.constructor('return process')();\n1;\n", { value: 1 }) ?? "", /EvalError|Error/);
  assert.match(judge("this.constructor.constructor('return process')().exit(1);\n", { value: 1 }) ?? "", /Error/);
  assert.match(judge("while (true) {}\n", { value: 1 }) ?? "", /timed out|Error/);
  assert.match(judge("((n: number) => { while (true) {} });\n", { calls: [["1", 1]] }) ?? "", /got/);
  assert.equal(judge("((f: (n: number) => number) => f(5));\n", { calls: [["(n) => n * 2", 10]] }), null);
});
