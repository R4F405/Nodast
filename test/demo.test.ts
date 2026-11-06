import assert from "node:assert/strict";
import { test } from "node:test";
import { demo } from "../src/demo.ts";

test("the offline demo renames, adds a parameter and refuses a bad edit", () => {
  const text = demo().join("\n");
  assert.match(text, /renamed rate to scale and 2 uses/);
  assert.match(text, /step takes \(x bonus\), updated 2 calls/);
  assert.match(text, /rejected: type-mismatch/);
  assert.match(text, /const step = \(x, bonus\) => x \+ scale \+ bonus;\nconst a = step\(1, 10\) \+ scale;/);
  assert.match(text, /const rate_cap = 7;/);
});
