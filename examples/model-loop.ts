// The loop between a model and the checker, with a scripted model instead of a real one.
// The first reply has a type error; Nodast sends the structured error back and the second reply passes.
// Run: node examples/model-loop.ts   (Node 22.18+; on older 22.x add --experimental-strip-types)

import { fixture, run } from "../src/index.ts";

const model = fixture([
  "(fn (a b) (if (lt a b) b true))", // wrong: one branch is a number, the other a bool
  "(fn (a b) (if (lt a b) b a))",
]);

const result = await run({ goal: "define a function that returns the larger of its two number arguments" }, model);

console.log("--- end of the second prompt the model received ---");
console.log(model.prompts[1]?.trimEnd().split("\n").slice(-6).join("\n"));
console.log("--- result ---");
console.log(result);
