import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

// The examples are linked from the README, so they have to keep running as the code moves.
function runExample(file: string): string {
  return execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", file], { encoding: "utf8" });
}

test("examples/check-and-print.ts prints, edits by id and refuses bad input", () => {
  const out = runExample("examples/check-and-print.ts");
  assert.match(out, /^type: number$/m);
  assert.match(out, /const x = double\(50\);/);
  assert.match(out, /rejected: type-mismatch/);
  assert.match(out, /rejected: undefined-name/);
});

test("examples/model-loop.ts recovers from a rejected reply", () => {
  const out = runExample("examples/model-loop.ts");
  assert.match(out, /type-mismatch/);
  assert.match(out, /attempts: 2/);
  assert.match(out, /a < b \? b : a/);
});
