import assert from "node:assert/strict";
import { test } from "node:test";
import { lexicalTokens, payload, plainVerdict } from "../bench/metrics.ts";

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
