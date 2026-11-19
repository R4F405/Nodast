// Parse compact text, check it, print TypeScript, and edit by node id. No model, no network.
// Run: node examples/check-and-print.ts   (Node 22.18+; on older 22.x add --experimental-strip-types)

import { applyEditText, errorLine } from "../src/contract.ts";
import { check, compact, parse, print } from "../src/index.ts";

// 1. A program as the model would write it.
const source = "(let double (fn (n) (mul n 2)) (let x (double 21) (if (gt x 40) x 0)))";

const parsed = parse(source);
if (!parsed.ok) throw new Error(parsed.error.message);
const checked = check(parsed.tree);
console.log("type:", checked.ok ? checked.type : errorLine(checked.error, parsed.tree));
console.log(print(parsed.tree));

// 2. The same tree with ids: this is what the model sees when it edits.
const withIds = compact(parsed.tree, { ids: true });
console.log("with ids:", withIds);

// 3. An edit by id: change the literal 21 to 50. Nothing else is resent.
const target = withIds.match(/(n\d+):21\b/)?.[1];
const edited = applyEditText(parsed.tree, `(edits (replace ${target} 50))`);
if (edited.ok) console.log(print(edited.tree));

// 4. A wrong edit is refused with a structured error, and the tree stays as it was.
const wrong = applyEditText(parsed.tree, `(edits (replace ${target} true))`);
if (!wrong.ok) console.log("rejected:", errorLine(wrong.error, wrong.tree));

// 5. A wrong program never reaches the printer.
const bad = parse("(let x 1 (add x y))");
if (bad.ok) {
  const verdict = check(bad.tree);
  if (!verdict.ok) console.log("rejected:", errorLine(verdict.error, bad.tree));
}
