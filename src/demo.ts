import { change, find, open, printed, type Session } from "./tools.ts";

// An offline walk through one tool session: the calls a model would make, and what Nodast answers.
// No network and no key. `pnpm demo` prints it; scripts/demo-svg.ts turns the same lines into docs/demo.svg.

const SOURCE =
  "(let rate 3 (let rate_cap 7 (let step (fn (x) (add x rate)) (let a (add (step 1) rate) (let b (step rate_cap) (mul a b))))))";

export function demo(): string[] {
  const opened = open(SOURCE);
  if (!opened.ok) throw new Error(opened.error);
  const session = opened.session;
  const lines: string[] = [];
  const say = (text = ""): void => {
    lines.push(...text.split("\n"));
  };
  const call = (label: string, reply: string): void => {
    say(`> ${label}`);
    say(`  ${reply}`);
  };

  say("# A program, as TypeScript");
  say(printed(session).trimEnd());
  say();
  say("# Goal: rename rate to scale. rate_cap must not change.");
  const rate = idOf(session, "let", "rate");
  call(`edit {op: "rename", id: "${rate}", name: "scale"}`, change(session, { op: "rename", id: rate, name: "scale" }));
  say();
  say("# Goal: give step a parameter bonus, pass 10 at every call.");
  const step = idOf(session, "let", "step");
  call(`edit {op: "param", id: "${step}", name: "bonus", expr: "10"}`, change(session, { op: "param", id: step, name: "bonus", expr: "10" }));
  const body = bodyOf(session, step);
  call(`edit {id: "${body}", expr: "(add (add x scale) bonus)"}`, change(session, { id: body, expr: "(add (add x scale) bonus)" }));
  say();
  say("# A mistake is refused before it reaches the file");
  const fresh = bodyOf(session, step);
  call(`edit {id: "${fresh}", expr: "(add x true)"}`, change(session, { id: fresh, expr: "(add x true)" }));
  say();
  say("# The same program, printed again");
  say(printed(session).trimEnd());
  return lines;
}

function idOf(session: Session, kind: string, name: string): string {
  const hit = find(session, { kind, name, limit: 1 }).split(" ")[0];
  if (hit === undefined || !hit.startsWith("n")) throw new Error(`no ${kind} ${name}`);
  return hit;
}

// The id of the fn body bound by the let at id, read from find's view of that fn.
function bodyOf(session: Session, letId: string): string {
  const view = find(session, { kind: "fn", limit: 5 })
    .split("\n")
    .find((line) => line.includes(`in ${letId}:`));
  const match = view?.match(/\) (n\d+):/);
  if (match?.[1] === undefined) throw new Error("no fn body");
  return match[1];
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/").replace(/^(?=[A-Za-z]:)/, "/")}`) {
  console.log(demo().join("\n"));
}
