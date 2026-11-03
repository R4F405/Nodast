import assert from "node:assert/strict";
import { test } from "node:test";
import { allows, grammar, type GrammarShape } from "../src/grammar.ts";

function expectState(source: string, shape: GrammarShape, stop: boolean, more: boolean) {
  assert.deepEqual(grammar(source, shape), { stop, more });
}

test("a program may stop only on a finished expression", () => {
  expectState("", "program", false, true);
  expectState("   ", "program", false, true);
  expectState("1", "program", true, true);
  expectState("0", "program", true, true);
  expectState("-3", "program", true, true);
  expectState("true", "program", true, true);
  expectState("false", "program", true, true);
  expectState("x", "program", true, true);
  expectState("(add 1 2)", "program", true, true);
  expectState("( sub 5 2 )", "program", true, true);
  expectState("(let x (add 1 2) x)", "program", true, true);
  expectState("(fn (x y) (add x y))", "program", true, true);
  expectState("(fn () 1)", "program", true, true);
  expectState("(f 1 2)", "program", true, true);
  expectState("(f)", "program", true, true);
  expectState("(if (lt x 0) 0 x)", "program", true, true);
  expectState("((f) 1)", "program", true, true);
});

test("an unfinished program stays open and a broken one closes", () => {
  expectState("-", "program", false, true);
  expectState("(add", "program", false, true);
  expectState("(add 1 2", "program", false, true);
  expectState("(let x", "program", false, true);
  expectState("(fn (x", "program", false, true);
  expectState("(fn (x x", "program", false, true);
  expectState("let", "program", false, true);
  expectState("(add 1 2) ", "program", true, true);
  expectState("(add 1 2)x", "program", false, false);
  expectState("(add 1 2 3)", "program", false, false);
  expectState("(let let x x)", "program", false, false);
  expectState("let ", "program", false, false);
  expectState("(fn (x x) 1)", "program", false, false);
  expectState("^", "program", false, false);
  expectState("01", "program", false, false);
  expectState("-01", "program", false, false);
  assert.equal(allows("0", "program", "1"), false);
  assert.equal(allows("0", "program", " "), true);
  assert.equal(allows("1", "program", "0"), true);
  assert.equal(allows("-", "program", "3"), true);
  assert.equal(allows("-", "program", " "), false);
  assert.equal(allows("(add 1 2)", "program", " "), true);
  assert.equal(allows("(add 1 2)", "program", "x"), false);
  assert.equal(allows("let", "program", "x"), true);
  assert.equal(allows("true", "program", "x"), true);
});

test("an edit list may stop only when every edit is closed", () => {
  expectState("(edits)", "edits", true, true);
  expectState(" (edits) ", "edits", true, true);
  expectState("(edits (replace n1 1))", "edits", true, true);
  expectState("(edits (insert n1 0 (add 1 2)))", "edits", true, true);
  expectState("(edits (delete n1))", "edits", true, true);
  expectState("(edits (replace n1 1) (delete n2))", "edits", true, true);
  expectState("(edits", "edits", false, true);
  expectState("(edits (rep", "edits", false, true);
  expectState("(edits (delete n1)", "edits", false, true);
  expectState("(edit", "edits", false, true);
  expectState("(edits (repx", "edits", false, false);
  expectState("(edits (nope n1))", "edits", false, false);
  expectState("1", "edits", false, false);
  expectState("(edits (insert n1 01 2))", "edits", false, false);
  assert.equal(allows("(edits (rep", "edits", "l"), true);
  assert.equal(allows("(edits (rep", "edits", "x"), false);
  assert.equal(allows("(edits)", "edits", " "), true);
});
