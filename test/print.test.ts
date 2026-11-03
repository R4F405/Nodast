import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
import { parse } from "../src/parse.ts";
import { print } from "../src/print.ts";

function source(text: string): string {
  const result = parse(text);
  if (!result.ok) assert.fail(result.error.message);
  return print(result.tree);
}

function assertTypeScript(text: string) {
  assert.notEqual(text, "");
  const result = ts.transpileModule(text, {
    fileName: "generated.ts",
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  });
  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.deepEqual(errors, []);
}

test("prints the readme let as const and a final expression", () => {
  assert.equal(source("(let x (add 1 2) x)"), "const x = 1 + 2;\nx;\n");
});

test("prints calls, functions, and if", () => {
  assert.equal(
    source("(let add1 (fn (x) (add x 1)) (add1 2))"),
    "const add1 = (x) => x + 1;\nadd1(2);\n",
  );
  assert.equal(source("(if (lt 1 2) (add 3 4) (mul 5 6))"), "1 < 2 ? 3 + 4 : 5 * 6;\n");
  assert.equal(source("(fn (x y) (sub x y))"), "((x, y) => x - y);\n");
});

test("parenthesizes by precedence and associativity", () => {
  assert.equal(source("(add 1 (mul 2 3))"), "1 + 2 * 3;\n");
  assert.equal(source("(mul (add 1 2) 3)"), "(1 + 2) * 3;\n");
  assert.equal(source("(sub 1 (sub 2 3))"), "1 - (2 - 3);\n");
  assert.equal(source("(eq (lt 1 2) true)"), "(1 < 2) === true;\n");
  assert.equal(source("(add (if true 1 2) 3)"), "(true ? 1 : 2) + 3;\n");
});

test("prints a let inside an expression as a function", () => {
  assert.equal(
    source("(let x (let y 1 y) x)"),
    "const x = (() => {\n  const y = 1;\n  return y;\n})();\nx;\n",
  );
});

test("prints a let inside a function as a block", () => {
  assert.equal(
    source("(fn (x) (let y (add x 1) y))"),
    "((x) => {\n  const y = x + 1;\n  return y;\n});\n",
  );
});

test("emits text that TypeScript can parse", () => {
  for (const program of [
    "(let x (add 1 2) x)",
    "(let add1 (fn (x) (add x 1)) (add1 2))",
    "(if (lt 1 2) (add 3 4) (mul 5 6))",
    "(fn (x) (let y (add x 1) y))",
    "(let x (let y 1 y) x)",
  ]) {
    assertTypeScript(source(program));
  }
});
