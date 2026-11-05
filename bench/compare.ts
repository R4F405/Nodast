import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { compact, type Layout } from "../src/compact.ts";
import { stripThink } from "../src/minimax.ts";
import { parse } from "../src/parse.ts";
import { print } from "../src/print.ts";
import { run } from "../src/contract.ts";
import { change, find, open, printed, show, view, type Change, type FindQuery, type Session } from "../src/tools.ts";
import {
  editTasks,
  GOALS,
  rates,
  renameTask,
  type Goal,
  bush,
  chain,
  expectedAfter,
  judge,
  lexicalTokens,
  payload,
  plainVerdict,
  stripFence,
  type Oracle,
} from "./metrics.ts";

const ATTEMPTS = 3;
const API_TRIES = 5;

type Reply = { content: string; completionTokens: number | null; promptTokens: number | null; ms: number };

type Loop = {
  infra: boolean;
  pass1: boolean;
  valid: boolean;
  correct: boolean;
  attempts: number;
  error: string | null;
  outTokens: number;
  replyBytes: number;
  replyTokens: number;
  promptTokens: number | null;
  inTokens: number;
  calls: number;
  ms: number;
};

class InfraError extends Error {}

function loadEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(".env");

// minimax speaks chat completions; openai speaks the Responses API, which its current models need for tool calls.
type Provider = "minimax" | "openai";
const PROVIDER: Provider = process.env.BENCH_PROVIDER === "openai" ? "openai" : "minimax";
const PROVIDERS = {
  minimax: { label: "MiniMax", key: "MINIMAX_API_KEY", model: process.env.MINIMAX_MODEL || "MiniMax-M3.1-Flash", base: process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1" },
  openai: { label: "OpenAI", key: "OPENAI_API_KEY", model: process.env.OPENAI_MODEL || "gpt-6.1-sol", base: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1" },
} as const;
const SETUP = PROVIDERS[PROVIDER];
const MODEL = SETUP.model;
const BASE = SETUP.base.replace(/\/$/, "");
const RUNS = Number(process.env.BENCH_RUNS || 3);
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY || 2);
// OpenAI reasoning models reject sampling parameters, so temperature only goes to MiniMax.
const TEMPERATURE = Number(process.env.BENCH_TEMPERATURE || 0.01);
const LOG = process.env.BENCH_LOG;
const OUT = process.env.BENCH_OUT || (PROVIDER === "minimax" ? "BENCH.md" : `bench/${PROVIDER}.md`);

function log(entry: Record<string, unknown>): void {
  if (LOG !== undefined && LOG !== "") appendFileSync(LOG, `${JSON.stringify(entry)}\n`);
}

type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };

type Call = { id: string; name: string; arguments: string };

type Turn = Reply & { calls: Call[] };

// One conversation with the model. send asks for the next turn; answer queues a tool result for the following send.
type Chat = { send(): Promise<Turn>; answer(call: Call, text: string): void; transcript(): unknown[] };

function apiKey(): string {
  const value = process.env[SETUP.key];
  if (value === undefined || value === "") throw new Error(`${SETUP.key} is missing`);
  return value;
}

async function post(path: string, body: unknown): Promise<{ json: unknown; ms: number }> {
  const start = process.hrtime.bigint();
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey()}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new InfraError(`${SETUP.label} ${response.status} ${(await response.text()).slice(0, 200)}`);
  const json = await response.json();
  return { json, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

function count(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function completionsChat(prompt: string, tools?: readonly ToolSpec[]): Chat {
  const messages: unknown[] = [{ role: "user", content: prompt }];
  const wire = tools?.map((tool) => ({ type: "function", function: tool }));
  return {
    async send() {
      const { json, ms } = await post("/chat/completions", {
        model: MODEL,
        messages,
        ...(wire === undefined ? {} : { tools: wire }),
        max_completion_tokens: 16384,
        reasoning_effort: "low",
        temperature: TEMPERATURE,
      });
      const body = json as {
        choices?: { message?: Record<string, unknown> & { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
        usage?: { completion_tokens?: number; prompt_tokens?: number };
      };
      const message = body.choices?.[0]?.message ?? {};
      const content = typeof message.content === "string" ? stripThink(message.content) : "";
      const calls = (Array.isArray(message.tool_calls) ? message.tool_calls : []).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      }));
      if (content.trim() === "" && calls.length === 0) throw new InfraError(`${SETUP.label} returned an empty reply`);
      messages.push(message);
      return { content, completionTokens: count(body.usage?.completion_tokens), promptTokens: count(body.usage?.prompt_tokens), ms, calls };
    },
    answer(call, text) {
      messages.push({ role: "tool", tool_call_id: call.id, content: text });
    },
    transcript: () => messages.slice(1),
  };
}

function responsesChat(prompt: string, tools?: readonly ToolSpec[]): Chat {
  const input: unknown[] = [{ role: "user", content: prompt }];
  const wire = tools?.map((tool) => ({ type: "function", ...tool }));
  return {
    async send() {
      const { json, ms } = await post("/responses", {
        model: MODEL,
        input,
        ...(wire === undefined ? {} : { tools: wire }),
        max_output_tokens: 16384,
        reasoning: { effort: "low" },
      });
      const body = json as {
        output?: (Record<string, unknown> & { type?: string; content?: { type?: string; text?: string }[]; call_id?: string; name?: string; arguments?: string })[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const output = Array.isArray(body.output) ? body.output : [];
      const content = output
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? [])
        .filter((part) => part.type === "output_text")
        .map((part) => part.text ?? "")
        .join("");
      const calls = output
        .filter((item) => item.type === "function_call")
        .map((item) => ({ id: item.call_id ?? "", name: item.name ?? "", arguments: item.arguments ?? "" }));
      if (content.trim() === "" && calls.length === 0) throw new InfraError(`${SETUP.label} returned an empty reply`);
      input.push(...output);
      return { content, completionTokens: count(body.usage?.output_tokens), promptTokens: count(body.usage?.input_tokens), ms, calls };
    },
    answer(call, text) {
      input.push({ type: "function_call_output", call_id: call.id, output: text });
    },
    transcript: () => input.slice(1),
  };
}

function openChat(prompt: string, tools?: readonly ToolSpec[]): Chat {
  const chat = PROVIDER === "openai" ? responsesChat(prompt, tools) : completionsChat(prompt, tools);
  return { ...chat, send: () => retried(() => chat.send()) };
}

async function ask(prompt: string): Promise<Reply> {
  return openChat(prompt).send();
}

async function retried<T>(job: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= API_TRIES; attempt += 1) {
    try {
      return await job();
    } catch (error) {
      last = error;
      const limited = error instanceof Error && error.message.startsWith(`${SETUP.label} 429`);
      await new Promise((resolve) => setTimeout(resolve, (limited ? 10_000 : 1000) * attempt));
    }
  }
  const message = last instanceof Error ? last.message : String(last);
  process.stderr.write(`infra: ${message}\n`);
  throw new InfraError(message);
}

function blank(): Loop {
  return {
    infra: false,
    pass1: false,
    valid: false,
    correct: false,
    attempts: 0,
    error: null,
    outTokens: 0,
    replyBytes: 0,
    replyTokens: 0,
    promptTokens: null,
    inTokens: 0,
    calls: 0,
    ms: 0,
  };
}

function track(loop: Loop, reply: Reply): void {
  if (loop.promptTokens === null) loop.promptTokens = reply.promptTokens;
  loop.inTokens += reply.promptTokens ?? 0;
  loop.calls += 1;
  loop.outTokens += reply.completionTokens ?? 0;
  loop.replyBytes += Buffer.byteLength(stripFence(reply.content));
  loop.replyTokens += lexicalTokens(stripFence(reply.content));
  loop.ms += reply.ms;
}

async function nodastLoop(goal: string, oracle: Oracle, program?: string, layout?: Layout): Promise<Loop> {
  const loop = blank();
  let lastReply = "";
  const result = await run(
    program === undefined ? { goal } : { goal, program },
    {
      async complete(prompt: string) {
        const reply = await ask(prompt);
        track(loop, reply);
        lastReply = reply.content;
        return reply.content;
      },
    },
    layout === undefined ? { attempts: ATTEMPTS } : { attempts: ATTEMPTS, layout },
  );
  loop.attempts = result.attempts;
  if (!result.ok) {
    loop.infra = result.error.code === "model-error";
    loop.error = result.error.code;
    return loop;
  }
  loop.valid = true;
  loop.pass1 = result.attempts === 1;
  const wrong = judge(result.source, oracle);
  loop.correct = wrong === null;
  loop.error = wrong === null ? null : "wrong-result";
  if (wrong !== null) log({ side: `nodast-${layout ?? "write"}`, goal, wrong, last: lastReply });
  return loop;
}

const MAX_TURNS = 10;
// Programs up to this many nodes go into the tool prompt whole, so the model can edit without calling find first.
const INLINE_NODES = Number(process.env.BENCH_INLINE_NODES || 256);

const TOOLS: ToolSpec[] = [
  {
    name: "find",
    description: "Find nodes by exact text, like 70050 or (add v4 70005), by kind, like let or add, or by name. Returns id, parent and a short view.",
    parameters: {
      type: "object",
      properties: { text: { type: "string" }, kind: { type: "string" }, name: { type: "string" } },
    },
  },
  {
    name: "show",
    description: "Show a node and its children to a depth.",
    parameters: { type: "object", properties: { id: { type: "string" }, depth: { type: "integer" } }, required: ["id"] },
  },
  {
    name: "edit",
    description:
      "Replace node id with expr, written without ids. op insert puts expr at index among the arguments of call id; op delete removes call argument id. op rename gives the binding at id, a let or a use of it, the name in expr, with every use that refers to it. The checker runs first; a rejected edit changes nothing. Set done when this completes the goal.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" },
        expr: { type: "string" },
        op: { type: "string", enum: ["replace", "insert", "delete", "rename"] },
        index: { type: "integer" },
        done: { type: "boolean" },
      },
      required: ["id"],
    },
  },
];

type ToolResult = { text: string; edit: "ok" | "rejected" | null; done: boolean };

function callTool(session: Session, call: Call): ToolResult {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
  } catch {
    return { text: "arguments are not valid JSON", edit: null, done: false };
  }
  const str = (key: string): string | undefined => (typeof args[key] === "string" ? (args[key] as string) : undefined);
  switch (call.name) {
    case "find": {
      const query: FindQuery = {};
      const text = str("text");
      const kind = str("kind");
      const name = str("name");
      if (text !== undefined) query.text = text;
      if (kind !== undefined) query.kind = kind;
      if (name !== undefined) query.name = name;
      return { text: find(session, query), edit: null, done: false };
    }
    case "show": {
      const depth = typeof args.depth === "number" ? Math.min(Math.max(0, Math.floor(args.depth)), 6) : undefined;
      return { text: show(session, str("id") ?? "", depth), edit: null, done: false };
    }
    case "edit": {
      const input: Change = { id: str("id") ?? "" };
      const op = str("op");
      const expr = str("expr");
      if (op !== undefined) input.op = op;
      if (expr !== undefined) input.expr = expr;
      if (typeof args.index === "number") input.index = Math.floor(args.index);
      const reply = change(session, input);
      const ok = reply.startsWith("ok");
      return { text: reply, edit: ok ? "ok" : "rejected", done: ok && args.done === true };
    }
    default:
      return { text: `unknown tool ${call.name}`, edit: null, done: false };
  }
}

async function toolLoop(goal: string, oracle: Oracle, source: string): Promise<Loop> {
  const loop = blank();
  const opened = open(source);
  if (!opened.ok) throw new Error(opened.error);
  const session = opened.session;
  const whole = view(session, INLINE_NODES);
  const prompt = [
    `A Nodast program is loaded: ${opened.summary}. Forms: (let name value body) (fn (a b) body) (if c then else) (f args) and add sub mul div eq lt gt lte gte, each (op a b).`,
    whole === undefined
      ? "Each node has an id, like n4:(add n5:v0 n6:7). You cannot see the program; use find, then edit."
      : "Each node has an id, like n4:(add n5:v0 n6:7). The program is below.",
    "Only the edit tool changes it. Set done on the edit that completes the goal.",
    ...(whole === undefined ? [] : ["", `program:\n${whole}`]),
    "",
    `goal: ${goal}`,
  ].join("\n");
  const chat = openChat(prompt, TOOLS);
  let edits = 0;
  let finished = false;
  for (let turn = 1; turn <= MAX_TURNS && !finished; turn += 1) {
    let reply: Turn;
    try {
      reply = await chat.send();
    } catch {
      loop.infra = true;
      loop.error = "model-error";
      return loop;
    }
    track(loop, reply);
    loop.replyBytes += reply.calls.reduce((sum, call) => sum + Buffer.byteLength(call.arguments), 0);
    if (reply.calls.length === 0) break;
    for (const call of reply.calls) {
      const result = callTool(session, call);
      if (result.edit !== null) {
        edits += 1;
        if (edits === 1) loop.pass1 = result.edit === "ok";
        if (result.edit === "ok") loop.valid = true;
      }
      if (result.done) finished = true;
      chat.answer(call, result.text);
    }
  }
  loop.attempts = edits;
  log({ side: "tools", goal, messages: chat.transcript() });
  if (!loop.valid) {
    loop.error = edits === 0 ? "no-edit" : "rejected";
    return loop;
  }
  const wrong = judge(printed(session), oracle);
  loop.correct = wrong === null;
  loop.error = wrong === null ? null : "wrong-result";
  return loop;
}

// The fair text baseline: the tools a coding agent uses on a plain file. grep finds lines, read shows a range,
// replace swaps one exact unique string, or every copy. Like an editor, a replace always applies and then
// reports whether the file still type checks and runs; only the final file is judged.
const TEXT_TOOLS: ToolSpec[] = [
  {
    name: "grep",
    description: "Find lines that contain this exact text. Returns line number and line for each match.",
    parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
  {
    name: "read",
    description: "Read count lines starting at line start (1-based), each prefixed with its number.",
    parameters: {
      type: "object",
      properties: { start: { type: "integer" }, count: { type: "integer" } },
      required: ["start"],
    },
  },
  {
    name: "replace",
    description:
      "Replace old with new in the file. old must appear exactly once, unless all is true, which replaces every occurrence; copy it exactly, without line numbers. The reply shows the changed lines and says whether the file still type checks and runs. Set done to true when this replace completes the goal: an ok replace with done ends the session.",
    parameters: {
      type: "object",
      properties: { old: { type: "string" }, new: { type: "string" }, all: { type: "boolean" }, done: { type: "boolean" } },
      required: ["old", "new"],
    },
  },
];

const GREP_LIMIT = 10;
const READ_LIMIT = 100;

function numbered(lines: readonly string[], start: number): string {
  return lines.map((line, index) => `${start + index}: ${line}`).join("\n");
}

function callTextTool(file: { text: string }, call: Call): ToolResult {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
  } catch {
    return { text: "arguments are not valid JSON", edit: null, done: false };
  }
  const str = (key: string): string => (typeof args[key] === "string" ? (args[key] as string) : "");
  const lines = file.text.split("\n");
  switch (call.name) {
    case "grep": {
      const needle = str("text");
      if (needle === "") return { text: "empty text", edit: null, done: false };
      const hits = lines.flatMap((line, index) => (line.includes(needle) ? [`${index + 1}: ${line}`] : []));
      if (hits.length === 0) return { text: "no match", edit: null, done: false };
      const more = hits.length > GREP_LIMIT ? `\n${hits.length - GREP_LIMIT} more; narrow the text` : "";
      return { text: hits.slice(0, GREP_LIMIT).join("\n") + more, edit: null, done: false };
    }
    case "read": {
      const start = typeof args.start === "number" ? Math.max(1, Math.floor(args.start)) : 1;
      const wanted = typeof args.count === "number" ? Math.floor(args.count) : 20;
      const slice = lines.slice(start - 1, start - 1 + Math.min(Math.max(1, wanted), READ_LIMIT));
      return { text: slice.length === 0 ? "past the end" : numbered(slice, start), edit: null, done: false };
    }
    case "replace": {
      const old = str("old");
      const fresh = str("new");
      if (old === "") return { text: "rejected: empty old", edit: "rejected", done: false };
      const at = file.text.indexOf(old);
      if (at < 0) return { text: "rejected: old not found", edit: "rejected", done: false };
      const every = args.all === true;
      if (!every && file.text.indexOf(old, at + 1) >= 0) {
        return { text: "rejected: old appears more than once; add context or set all", edit: "rejected", done: false };
      }
      const next = every ? file.text.split(old).join(fresh) : file.text.slice(0, at) + fresh + file.text.slice(at + old.length);
      const verdict = plainVerdict(next);
      const occurrences = file.text.split(old).length - 1;
      file.text = next;
      const first = next.slice(0, at).split("\n").length;
      const shown = next.split("\n").slice(first - 1, first - 1 + Math.min(fresh.split("\n").length, 3));
      const what = every ? `replaced ${occurrences} occurrences` : `now ${numbered(shown, first)}`;
      // Like an editor, replace always applies and then reports diagnostics; only the final file is judged.
      if (!verdict.ok) return { text: `applied, ${what}, but the file now fails: ${verdict.error}`, edit: "rejected", done: false };
      return { text: `ok, ${what}`, edit: "ok", done: args.done === true };
    }
    default:
      return { text: `unknown tool ${call.name}`, edit: null, done: false };
  }
}

async function textToolLoop(goal: string, oracle: Oracle, source: string, inline: boolean): Promise<Loop> {
  const loop = blank();
  const file = { text: source };
  const total = source.split("\n").length;
  const prompt = [
    "A TypeScript file is loaded. Keep the last statement as the expression whose value is the result.",
    inline
      ? `It has ${total} lines and is shown below; grep and read also work on it.`
      : `It has ${total} lines. You cannot see it; use grep and read to locate code, then replace to change it.`,
    "Only the replace tool changes the file; a change written as text does nothing. Call replace with done set to true when it completes the goal.",
    ...(inline ? ["", `file:\n${source}`] : []),
    "",
    `goal: ${goal}`,
  ].join("\n");
  const chat = openChat(prompt, TEXT_TOOLS);
  let edits = 0;
  let finished = false;
  for (let turn = 1; turn <= MAX_TURNS && !finished; turn += 1) {
    let reply: Turn;
    try {
      reply = await chat.send();
    } catch {
      loop.infra = true;
      loop.error = "model-error";
      return loop;
    }
    track(loop, reply);
    loop.replyBytes += reply.calls.reduce((sum, call) => sum + Buffer.byteLength(call.arguments), 0);
    if (reply.calls.length === 0) break;
    for (const call of reply.calls) {
      const result = callTextTool(file, call);
      if (result.edit !== null) {
        edits += 1;
        if (edits === 1) loop.pass1 = result.edit === "ok";
        if (result.edit === "ok") loop.valid = true;
      }
      if (result.done) finished = true;
      chat.answer(call, result.text);
    }
  }
  loop.attempts = edits;
  log({ side: "text-tools", goal, messages: chat.transcript() });
  loop.valid = edits > 0 && plainVerdict(file.text).ok;
  if (!loop.valid) {
    loop.error = edits === 0 ? "no-edit" : "rejected";
    return loop;
  }
  const wrong = judge(file.text, oracle);
  loop.correct = wrong === null;
  loop.error = wrong === null ? null : "wrong-result";
  return loop;
}

async function plainLoop(prompt: (rejections: string) => string, oracle: Oracle): Promise<Loop> {
  const loop = blank();
  let rejections = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    loop.attempts = attempt;
    let reply: Reply;
    try {
      reply = await ask(prompt(rejections));
    } catch {
      loop.infra = true;
      loop.error = "model-error";
      return loop;
    }
    track(loop, reply);
    const verdict = plainVerdict(reply.content);
    if (verdict.ok) {
      loop.valid = true;
      loop.pass1 = attempt === 1;
      const wrong = judge(reply.content, oracle);
      loop.correct = wrong === null;
      loop.error = wrong === null ? null : "wrong-result";
      return loop;
    }
    loop.error = verdict.error.split(" ")[0] ?? "error";
    rejections += `\nrejected:\n${stripFence(reply.content)}\nerror:\n${verdict.error}\n`;
  }
  return loop;
}

const RESULT_RULE =
  "The last statement must be an expression whose value is the result; when the goal asks for a function, the last statement is the function value itself, like ((n: number) => n * 2);. No console output.";

function plainWritePrompt(goal: string): (rejections: string) => string {
  return (rejections) =>
    `Reply with only TypeScript that can be executed. No prose.\n${RESULT_RULE}\n\ngoal: ${goal}\n${rejections}${rejections === "" ? "" : "\nReply again with a corrected answer.\n"}`;
}

function plainEditPrompt(goal: string, file: string): (rejections: string) => string {
  return (rejections) =>
    `Reply with only the full TypeScript file after the change. No prose.\nKeep the last statement as the expression whose value is the result.\n\ngoal: ${goal}\n\nfile:\n${file}${rejections}${rejections === "" ? "" : "\nReply again with a corrected answer.\n"}`;
}

async function pool<T>(jobs: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next;
      next += 1;
      const job = jobs[index];
      if (job === undefined) return;
      results[index] = await job();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, limit) }, worker));
  return results;
}

type Column = { name: string; loops: Loop[] };

type Group = Map<string, Loop[]>;

function push(groups: Group[], index: number, side: string, loop: Loop): void {
  const group = groups[index];
  if (group === undefined) return;
  const list = group.get(side) ?? [];
  list.push(loop);
  group.set(side, list);
}

async function writeBench(): Promise<Group[]> {
  const jobs: Array<() => Promise<{ index: number; side: string; loop: Loop }>> = [];
  GOALS.forEach((item, index) => {
    for (let r = 0; r < RUNS; r += 1) {
      jobs.push(async () => ({ index, side: "Nodast", loop: await nodastLoop(item.goal, item.oracle) }));
      jobs.push(async () => ({ index, side: "Texto plano", loop: await plainLoop(plainWritePrompt(item.goal), item.oracle) }));
    }
  });
  const groups: Group[] = GOALS.map(() => new Map());
  for (const item of await pool(jobs, CONCURRENCY)) push(groups, item.index, item.side, item.loop);
  return groups;
}

const EDIT_SIDES = ["Nodast, tools", "Nodast, ids por líneas", "Nodast, ids en una línea", "Texto, tools", "Texto plano"] as const;

function chainGoals(length: number): Goal[] {
  const source = chain(length);
  return editTasks(length).map((task) => ({ goal: task.goal, oracle: { value: expectedAfter(task, source) } }));
}

async function editBench(source: string, tasks: readonly Goal[]): Promise<Group[]> {
  const parsed = parse(source);
  if (!parsed.ok) throw new Error(parsed.error.message);
  const file = print(parsed.tree);
  const opened = open(source);
  if (!opened.ok) throw new Error(opened.error);
  const inline = view(opened.session, INLINE_NODES) !== undefined;
  const jobs: Array<() => Promise<{ index: number; side: string; loop: Loop }>> = [];
  tasks.forEach((task, index) => {
    const oracle = task.oracle;
    for (let r = 0; r < RUNS; r += 1) {
      jobs.push(async () => ({ index, side: EDIT_SIDES[0], loop: await toolLoop(task.goal, oracle, source) }));
      jobs.push(async () => ({ index, side: EDIT_SIDES[1], loop: await nodastLoop(task.goal, oracle, source, "lines") }));
      jobs.push(async () => ({ index, side: EDIT_SIDES[2], loop: await nodastLoop(task.goal, oracle, source, "inline") }));
      jobs.push(async () => ({ index, side: EDIT_SIDES[3], loop: await textToolLoop(task.goal, oracle, file, inline) }));
      jobs.push(async () => ({ index, side: EDIT_SIDES[4], loop: await plainLoop(plainEditPrompt(task.goal, file), oracle) }));
    }
  });
  const groups: Group[] = tasks.map(() => new Map());
  for (const item of await pool(jobs, CONCURRENCY)) push(groups, item.index, item.side, item.loop);
  return groups;
}

function counted(loops: Loop[]): Loop[] {
  return loops.filter((loop) => !loop.infra);
}

function rate(loops: Loop[], pick: (loop: Loop) => boolean): string {
  const real = counted(loops);
  if (real.length === 0) return "—";
  const hits = real.filter(pick).length;
  return `${hits}/${real.length} (${Math.round((hits / real.length) * 100)}%)`;
}

function avg(loops: Loop[], pick: (loop: Loop) => number | null, digits = 0): string {
  const values = counted(loops)
    .map(pick)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return "—";
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(digits);
}

function errors(loops: Loop[]): string {
  const counts = new Map<string, number>();
  for (const loop of loops) {
    if (loop.correct) continue;
    const key = loop.error ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return "—";
  return [...counts].map(([key, count]) => `${key} ×${count}`).join(", ");
}

function columns(groups: Group[], sides: readonly string[]): Column[] {
  return sides.map((name) => ({ name, loops: groups.flatMap((group) => group.get(name) ?? []) }));
}

function table(header: string[], rows: string[][]): string {
  const align = header.map((_, index) => (index === 0 ? "---" : "---:"));
  return [`| ${header.join(" | ")} |`, `| ${align.join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

function summary(cols: Column[], withPrompt: boolean): string {
  const row = (label: string, cell: (loops: Loop[]) => string): string[] => [label, ...cols.map((col) => cell(col.loops))];
  const rows = [
    row("Pass@1, válido al primer intento", (l) => rate(l, (x) => x.pass1)),
    row(`Válido en ≤ ${ATTEMPTS} intentos`, (l) => rate(l, (x) => x.valid)),
    row(`Correcto en ≤ ${ATTEMPTS} intentos (oráculo)`, (l) => rate(l, (x) => x.correct)),
    row("Intentos medios", (l) => avg(l, (x) => x.attempts, 2)),
    row("`completion_tokens` medios, todos los intentos", (l) => avg(l, (x) => x.outTokens)),
    ...(withPrompt
      ? [
          row("`prompt_tokens` del primer intento", (l) => avg(l, (x) => x.promptTokens)),
          row("`prompt_tokens` totales, todas las llamadas", (l) => avg(l, (x) => x.inTokens)),
          row("Llamadas al modelo", (l) => avg(l, (x) => x.calls, 1)),
        ]
      : []),
    row("Respuesta visible, tokens léxicos medios", (l) => avg(l, (x) => x.replyTokens)),
    row("Respuesta visible, bytes medios", (l) => avg(l, (x) => x.replyBytes)),
    row("Latencia media, todos los intentos", (l) => `${avg(l, (x) => x.ms)} ms`),
    row("Fallos de API excluidos", (l) => String(l.filter((x) => x.infra).length)),
    row("Fallos", errors),
  ];
  return table(["", ...cols.map((col) => col.name)], rows);
}

function perItem(labels: readonly string[], groups: Group[], sides: readonly string[]): string {
  const rows = groups.map((group, index) => [
    labels[index] ?? "",
    ...sides.map((side) => rate(group.get(side) ?? [], (x) => x.correct)),
  ]);
  return table(["Objetivo", ...sides.map((side) => `Correcto, ${side}`)], rows);
}

const SIZES = (process.env.BENCH_SIZES || "50,500")
  .split(",")
  .map((item) => Number(item.trim()))
  .filter((item) => item > 0);

process.stderr.write(`write bench: ${GOALS.length} goals × ${RUNS} runs\n`);
const written = process.env.BENCH_WRITE === "0" ? GOALS.map((): Group => new Map()) : await writeBench();
const editSections: string[] = [];
for (const length of SIZES) {
  process.stderr.write(`edit bench: chain ${length}, ${editTasks(length).length} tasks × ${RUNS} runs\n`);
  const groups = await editBench(chain(length), chainGoals(length));
  const parsed = parse(chain(length));
  if (!parsed.ok) throw new Error(parsed.error.message);
  const tsBytes = Buffer.byteLength(print(parsed.tree));
  const linesBytes = Buffer.byteLength(compact(parsed.tree, { ids: true, layout: "lines" }));
  const inlineBytes = Buffer.byteLength(compact(parsed.tree, { ids: true }));
  editSections.push(`### Cadena de ${length} \`let\`

${length * 4 + 3} nodos. TypeScript: ${tsBytes} bytes. Árbol con ids: ${linesBytes} bytes por líneas, ${inlineBytes} en una línea.

${summary(columns(groups, EDIT_SIDES), true)}

${perItem(editTasks(length).map((task) => task.goal), groups, EDIT_SIDES)}`);
}

const RENAME_SIZES = (process.env.BENCH_RENAME || "40,400")
  .split(",")
  .map((item) => Number(item.trim()))
  .filter((item) => item > 0);
for (const length of RENAME_SIZES) {
  process.stderr.write(`rename bench: ${length} steps × ${RUNS} runs\n`);
  const source = rates(length);
  const groups = await editBench(source, [renameTask(source)]);
  const uses = length - Math.floor(length / 4);
  editSections.push(`### Renombrar en ${length} pasos

\`rate\` aparece en ${uses} usos y \`rate_cap\`, que empieza igual, en ${Math.floor(length / 4)}. Objetivo: llamar \`scale\` a \`rate\` sin tocar \`rate_cap\`. Correcto pide el mismo valor y el mismo archivo que un renombrado bien hecho, sin contar espacios. Nodast con tools tiene \`op rename\`, que sigue los ámbitos; texto con tools tiene \`all\` en \`replace\`; las variantes de ids solo tienen \`replace\`, \`insert\` y \`delete\`.

${summary(columns(groups, EDIT_SIDES), true)}`);
}

const samples = [
  ["let y suma", payload("(let x (add 1 2) x)")],
  ["función de un argumento", payload("(fn (x) (add x 1))")],
  ["if con x ligado", payload("(let x 1 (if (lt x 0) 0 x))")],
  ...SIZES.map((length) => [`cadena de ${length} let`, payload(chain(length))] as const),
  ["suma de 8191 nodos", payload(bush(12))],
] as const;

const payloadRows = samples.map(
  ([label, sample]) =>
    `| ${label} | ${sample.compactBytes} / ${sample.compactTokens} | ${sample.bufferBytes} | ${sample.printedBytes} / ${sample.printedTokens} |`,
);

const WRITE_SIDES = ["Nodast", "Texto plano"] as const;

const markdown = `# Medición

Una pasada el ${new Date().toISOString().slice(0, 10)} con ${MODEL} (${SETUP.label}), ${PROVIDER === "minimax" ? `temperatura ${TEMPERATURE}` : "sin temperatura, que el modelo no acepta"}, razonamiento \`low\`, ${RUNS} repeticiones por objetivo y tope de ${ATTEMPTS} intentos. \`pnpm bench\` la repite con MiniMax por chat completions y escribe en \`BENCH.md\`; con \`BENCH_PROVIDER=openai\` va a OpenAI por la API Responses y escribe en \`bench/openai.md\`. \`BENCH_RUNS\`, \`BENCH_SIZES\`, \`BENCH_CONCURRENCY\`, \`BENCH_TEMPERATURE\` y \`BENCH_OUT\` la ajustan. La velocidad interna del motor está aparte, en [bench/engine.md](${OUT.includes("/") ? "engine.md" : "bench/engine.md"}).

Válido: Nodast parsea y pasa \`check\`; el texto plano sale de \`tsc\` sin error y corre. Correcto: además, el valor de la última expresión coincide con el oráculo del objetivo, o la función que devuelve da lo esperado con varias entradas. Los dos lados reintentan solo por errores estructurales; el oráculo no se le enseña al modelo.

Si el modelo mete un bloque \`<think>\` en el texto, como hace MiniMax, se quita antes de juzgar. Un fallo de API, tras ${API_TRIES} reintentos de red, no cuenta como fallo del formato: se excluye y se informa aparte. \`completion_tokens\` incluye el razonamiento del modelo; la respuesta visible se cuenta aparte con el contador léxico.

## Escribir desde cero

${GOALS.length} objetivos × ${RUNS} repeticiones.

${summary(columns(written, WRITE_SIDES), false)}

${perItem(GOALS.map((goal) => goal.goal), written, WRITE_SIDES)}

## Editar un archivo existente

Una cadena de \`let\` donde cada paso suma o resta una constante. Nodast sin tools recibe el árbol con un id delante de cada nodo y devuelve \`(edits ...)\`; se prueba con cada \`let\` en su línea y con todo en una. La variante con tools usa \`find\`, \`show\` y \`edit\` por function calling, hasta ${MAX_TURNS} llamadas; sus intentos son llamadas a \`edit\`, que recibe \`id\`, \`expr\` y \`op\` como campos sueltos. Su prompt resume la gramática en una línea. Con ≤ ${INLINE_NODES} nodos recibe además el árbol entero con ids; con más, solo un resumen. Un \`edit\` aceptado con \`done\` cierra la sesión sin otra llamada. Texto con tools es lo que usa un agente de código sobre un archivo normal: \`grep\` busca líneas, \`read\` muestra un rango y \`replace\` cambia un texto exacto que aparezca una sola vez; como un editor, \`replace\` se aplica siempre y avisa si el archivo deja de compilar o de correr, y se juzga el archivo final. Recibe el archivo entero en el mismo caso en que Nodast con tools recibe el árbol, con el mismo \`done\` y el mismo tope de llamadas. El texto plano recibe el TypeScript y devuelve el archivo entero. El oráculo es el valor final del programa ya editado.

${editSections.join("\n\n")}

## Payload

Tokens léxicos: identificadores, números, operadores y signos, con el mismo contador en los dos textos. El buffer se compara en bytes.

| Programa | Compacto, bytes / tokens | Buffer, bytes | TypeScript, bytes / tokens |
| --- | ---: | ---: | ---: |
${payloadRows.join("\n")}
`;

writeFileSync(OUT, markdown);
process.stdout.write(markdown);
