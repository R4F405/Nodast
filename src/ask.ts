import { run } from "./contract.ts";
import { minimaxFromEnv } from "./minimax.ts";

const goal = process.argv.slice(2).join(" ").trim();
if (goal === "") {
  console.error("Usage: pnpm ask -- <goal>");
  process.exit(1);
}

const result = await run({ goal }, minimaxFromEnv());
if (!result.ok) {
  console.error(JSON.stringify(result.error));
  process.exit(1);
}

console.log(result.source);
