import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { compact, type Layout } from "../src/compact.ts";
import { stripThink } from "../src/minimax.ts";
import { parse } from "../src/parse.ts";
import { print } from "../src/print.ts";
import { LANGUAGE, run } from "../src/contract.ts";
import { edit, find, open, printed, show, type FindQuery, type Session } from "../src/tools.ts";
import {

  editTasks,
  GOALS,
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
const MODEL = process.env.MINIMAX_MODEL || "MiniMax-M3.1-Flash";
const BASE = (process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1").replace(/\/$/, "");
const RUNS = Number(process.env.BENCH_RUNS || 3);
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY || 2);
const TEMPERATURE = Number(process.env.BENCH_TEMPERATURE || 0.01);
const LOG = process.env.BENCH_LOG;

function log(entry: Record<string, unknown>): void {
  if (LOG !== undefined && LOG !== "") appendFileSync(LOG, `${JSON.stringify(entry)}
`);
}

type ToolCall = { id: string; function: { name: string; arguments: string } };

type ChatReply = Reply & { message: Record<string, unknown>; toolCalls: ToolCall[] };

async function askOnce(messages: unknown[], tools?: unknown[]): Promise<ChatReply> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (apiKey === undefined || apiKey === "") throw new Error("MINIMAX_API_KEY is missing");
  const start = process.hrtime.bigint();
  const response = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(tools === undefined ? {} : { tools }),
      max_completion_tokens: 16384,
      reasoning_effort: "low",
      temperature: TEMPERATURE,
    }),
  });
  if (!response.ok) throw new InfraError(`MiniMax ${response.status} ${(await response.text()).slice(0, 200)}`);
  const body = (await response.json()) as {
    choices?: { message?: Record<string, unknown> & { content?: string | null; tool_calls?: ToolCall[] } }[];
    usage?: { completion_tokens?: number; prompt_tokens?: number };
  };
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const message = body.choices?.[0]?.message ?? {};
  const raw = message.content;
  const content = typeof raw === "string" ? stripThink(raw) : "";
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  if (content.trim() === "" && toolCalls.length === 0) throw new InfraError("MiniMax returned an empty reply");
  const completion = body.usage?.completion_tokens;
  const promptTokens = body.usage?.prompt_tokens;
  return {
    content,
    completionTokens: typeof completion === "number" ? completion : null,
    promptTokens: typeof promptTokens === "number" ? promptTokens : null,
    ms,
    message,
    toolCalls,
  };
}

async function ask(prompt: string): Promise<Reply> {
  return chat([{ role: "user", content: prompt }]);
}

async function chat(messages: unknown[], tools?: unknown[]): Promise<ChatReply> {
  let last: unknown;
  for (let attempt = 1; attempt <= API_TRIES; attempt += 1) {
    try {
      return await askOnce(messages, tools);
    } catch (error) {
      last = error;
      const limited = error instanceof Error && error.message.startsWith("MiniMax 429");
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

const TOOLS = [
  {
    type: "function",
    function: {
      name: "find",
      description:
        "Find nodes. text matches a node's exact compact text, like 70050 or (add v4 70005). kind is a node kind such as let, add, num, if. name matches a bound or used name. Returns id, parent and a short view of each match.",
      parameters: {
        type: "object",
        properties: { text: { type: "string" }, kind: { type: "string" }, name: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show",
      description: "Show the node with this id and its children, folding deeper lists into id:...",
      parameters: {
        type: "object",
        properties: { id: { type: "string" }, depth: { type: "integer" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit",
      description:
        "Apply an (edits ...) list, like (edits (replace n12 7)). The checker runs first; the reply says ok or why it was rejected, and a rejected list changes nothing.",
      parameters: { type: "object", properties: { edits: { type: "string" } }, required: ["edits"] },
    },
  },
];

function callTool(session: Session, call: ToolCall): { text: string; edit: "ok" | "rejected" | null } {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
  } catch {
    return { text: "arguments are not valid JSON", edit: null };
  }
  const str = (key: string): string | undefined => (typeof args[key] === "string" ? (args[key] as string) : undefined);
  switch (call.function.name) {
    case "find": {
      const query: FindQuery = {};
      const text = str("text");
      const kind = str("kind");
      const name = str("name");
      if (text !== undefined) query.text = text;
      if (kind !== undefined) query.kind = kind;
      if (name !== undefined) query.name = name;
      return { text: find(session, query), edit: null };
    }
    case "show": {
      const depth = typeof args.depth === "number" ? Math.min(Math.max(0, Math.floor(args.depth)), 6) : undefined;
      return { text: show(session, str("id") ?? "", depth), edit: null };
    }
    case "edit": {
      const reply = edit(session, str("edits") ?? "");
      return { text: reply, edit: reply.startsWith("ok") ? "ok" : "rejected" };
    }
    default:
      return { text: `unknown tool ${call.function.name}`, edit: null };
  }
}

async function toolLoop(goal: string, oracle: Oracle, source: string): Promise<Loop> {
  const loop = blank();
  const opened = open(source);
  if (!opened.ok) throw new Error(opened.error);
  const session = opened.session;
  const prompt = [
    ...LANGUAGE,
    "",
    `A program is loaded: ${opened.summary}. You cannot see it; use find and show to locate nodes, then edit to change them.`,
    "Only the edit tool changes the program; an edit written as text does nothing. When edit has answered ok and the goal is done, reply with the word done and no tool call.",
    "",
    `goal: ${goal}`,
  ].join("\n");
  const messages: unknown[] = [{ role: "user", content: prompt }];
  let edits = 0;
  for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
    let reply: ChatReply;
    try {
      reply = await chat(messages, TOOLS);
    } catch {
      loop.infra = true;
      loop.error = "model-error";
      return loop;
    }
    track(loop, reply);
    loop.replyBytes += reply.toolCalls.reduce((sum, call) => sum + Buffer.byteLength(call.function.arguments), 0);
    messages.push(reply.message);
    if (reply.toolCalls.length === 0) break;
    for (const call of reply.toolCalls) {
      const result = callTool(session, call);
      if (result.edit !== null) {
        edits += 1;
        if (edits === 1) loop.pass1 = result.edit === "ok";
        if (result.edit === "ok") loop.valid = true;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result.text });
    }
  }
  loop.attempts = edits;
  log({ side: "tools", goal, messages: messages.slice(1) });
  if (!loop.valid) {
    loop.error = edits === 0 ? "no-edit" : "rejected";
    return loop;
  }
  const wrong = judge(printed(session), oracle);
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

const EDIT_SIDES = ["Nodast, tools", "Nodast, ids por líneas", "Nodast, ids en una línea", "Texto plano"] as const;

async function editBench(length: number): Promise<Group[]> {
  const source = chain(length);
  const parsed = parse(source);
  if (!parsed.ok) throw new Error(parsed.error.message);
  const file = print(parsed.tree);
  const tasks = editTasks(length);
  const jobs: Array<() => Promise<{ index: number; side: string; loop: Loop }>> = [];
  tasks.forEach((task, index) => {
    const oracle: Oracle = { value: expectedAfter(task, source) };
    for (let r = 0; r < RUNS; r += 1) {
      jobs.push(async () => ({ index, side: EDIT_SIDES[0], loop: await toolLoop(task.goal, oracle, source) }));
      jobs.push(async () => ({ index, side: EDIT_SIDES[1], loop: await nodastLoop(task.goal, oracle, source, "lines") }));
      jobs.push(async () => ({ index, side: EDIT_SIDES[2], loop: await nodastLoop(task.goal, oracle, source, "inline") }));
      jobs.push(async () => ({ index, side: EDIT_SIDES[3], loop: await plainLoop(plainEditPrompt(task.goal, file), oracle) }));
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

const SIZES = (process.env.BENCH_SIZES || "50,500").split(",").map((item) => Number(item.trim()));

process.stderr.write(`write bench: ${GOALS.length} goals × ${RUNS} runs\n`);
const written = process.env.BENCH_WRITE === "0" ? GOALS.map((): Group => new Map()) : await writeBench();
const editSections: string[] = [];
for (const length of SIZES) {
  process.stderr.write(`edit bench: chain ${length}, ${editTasks(length).length} tasks × ${RUNS} runs\n`);
  const groups = await editBench(length);
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

Una pasada el ${new Date().toISOString().slice(0, 10)} con ${MODEL}, temperatura ${TEMPERATURE}, ${RUNS} repeticiones por objetivo y tope de ${ATTEMPTS} intentos. \`pnpm bench\` la repite y llama a MiniMax. \`BENCH_RUNS\`, \`BENCH_SIZES\`, \`BENCH_CONCURRENCY\` y \`BENCH_TEMPERATURE\` la ajustan. La velocidad interna del motor está aparte, en [bench/engine.md](bench/engine.md).

Válido: Nodast parsea y pasa \`check\`; el texto plano sale de \`tsc\` sin error y corre. Correcto: además, el valor de la última expresión coincide con el oráculo del objetivo, o la función que devuelve da lo esperado con varias entradas. Los dos lados reintentan solo por errores estructurales; el oráculo no se le enseña al modelo.

El bloque \`<think>\` que MiniMax mete en \`content\` se quita antes de juzgar. Un fallo de API, tras ${API_TRIES} reintentos de red, no cuenta como fallo del formato: se excluye y se informa aparte. \`completion_tokens\` incluye el razonamiento del modelo; la respuesta visible se cuenta aparte con el contador léxico.

## Escribir desde cero

${GOALS.length} objetivos × ${RUNS} repeticiones.

${summary(columns(written, WRITE_SIDES), false)}

${perItem(GOALS.map((goal) => goal.goal), written, WRITE_SIDES)}

## Editar un archivo existente

Una cadena de \`let\` donde cada paso suma o resta una constante. Nodast recibe el árbol con un id delante de cada nodo y devuelve \`(edits ...)\`; se prueba con cada \`let\` en su línea y con todo en una. La variante con tools no ve el árbol: recibe un resumen y usa \`find\`, \`show\` y \`edit\` por function calling, hasta ${MAX_TURNS} llamadas; sus intentos son llamadas a \`edit\`. El texto plano recibe el TypeScript y devuelve el archivo entero. El oráculo es el valor final del programa ya editado.

${editSections.join("\n\n")}

## Payload

Tokens léxicos: identificadores, números, operadores y signos, con el mismo contador en los dos textos. El buffer se compara en bytes.

| Programa | Compacto, bytes / tokens | Buffer, bytes | TypeScript, bytes / tokens |
| --- | ---: | ---: | ---: |
${payloadRows.join("\n")}
`;

writeFileSync("BENCH.md", markdown);
process.stdout.write(markdown);
