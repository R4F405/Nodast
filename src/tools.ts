import { check } from "./check.ts";
import { childrenOf, compact } from "./compact.ts";
import { applyEditText, errorLine } from "./contract.ts";
import type { Expr } from "./ir.ts";
import { parse } from "./parse.ts";
import { print } from "./print.ts";

// The calls a model makes to work on one program without reading all of it.
// Every reply is short plain text, so it costs little context and reads the same through MCP, a CLI or function calling.

// used holds every id the session has had, so an edit never gives a new node an id the model saw on another node.
export type Session = { tree: Expr; used: Set<string> };

export type FindQuery = { text?: string; kind?: string; name?: string; limit?: number };

const DEFAULT_LIMIT = 10;
const SHOW_DEPTH = 2;
const MAX_SPOTS = 3;
const KINDS: readonly string[] = ["num", "bool", "var", "let", "fn", "call", "if", "add", "sub", "mul", "div", "eq", "lt", "gt", "lte", "gte"];

export function open(source: string): { ok: true; session: Session; summary: string } | { ok: false; error: string } {
  const parsed = parse(source);
  if (!parsed.ok) {
    return { ok: false, error: `parse ${parsed.error.position.line}:${parsed.error.position.column} ${parsed.error.message}` };
  }
  const checked = check(parsed.tree);
  if (!checked.ok) return { ok: false, error: errorLine(checked.error, parsed.tree) };
  const session = { tree: parsed.tree, used: new Set<string>() };
  remember(session);
  return { ok: true, session, summary: summary(session) };
}

// The whole program with ids, one let per line, when it has at most maxNodes nodes. Small programs cost less
// to show once than to explore with find and show over several model calls.
export function view(session: Session, maxNodes: number): string | undefined {
  if (count(session.tree) > maxNodes) return undefined;
  return compact(session.tree, { ids: true, layout: "lines" });
}

export function summary(session: Session): string {
  const checked = check(session.tree);
  const type = checked.ok ? checked.type : "invalid";
  return `root ${session.tree.id}, ${count(session.tree)} nodes, type ${type}`;
}

// Matches nodes by exact compact text (like 70050 or (add v4 70005)), by kind, or by a bound or used name.
// Empty or blank fields count as absent: some models fill every parameter of a tool, sending "" for the ones they skip.
export function find(session: Session, raw: FindQuery): string {
  const query = filled(raw);
  if (query.kind !== undefined && !KINDS.includes(query.kind)) return `unknown kind ${query.kind}; kinds are ${KINDS.join(" ")}`;
  if (query.text === undefined && query.kind === undefined && query.name === undefined) return "empty query; give text, kind or name";
  const limit = query.limit ?? DEFAULT_LIMIT;
  const hits: string[] = [];
  let total = 0;
  walk(session.tree, null, (node, parent) => {
    if (!matches(node, query)) return;
    total += 1;
    if (hits.length >= limit) return;
    const where = parent === null ? "root" : `in ${parent.id}:${headOf(parent)}`;
    hits.push(`${node.id} ${where}: ${compact(node, { ids: true, depth: 1 })}`);
  });
  if (total === 0) return "no match";
  const more = total > hits.length ? `\n${total - hits.length} more; narrow the query` : "";
  return `${hits.join("\n")}${more}`;
}

export function show(session: Session, id: string, depth = SHOW_DEPTH): string {
  const node = locate(session.tree, id);
  if (node === undefined) return `unknown-id ${id}`;
  return compact(node.node, { ids: true, depth });
}

// Applies an (edits ...) list. On success the session moves to the new tree; on failure it stays as it was.
// Bare operations like (replace n4 7) or several of them are wrapped in (edits ...), since models often drop it.
export function edit(session: Session, text: string): string {
  const trimmed = text.trim();
  const bare = /^\(\s*(replace|insert|delete)\b/.test(trimmed);
  const applied = applyEditText(session.tree, bare ? `(edits ${trimmed})` : trimmed, session.used);
  if (!applied.ok) return `rejected: ${errorLine(applied.error, applied.tree)}`;
  const around = editedSpots(session.tree, trimmed);
  session.tree = applied.tree;
  remember(session);
  const views = around.flatMap((id) => {
    const found = locate(session.tree, id);
    return found === undefined ? [] : [compact(found.node, { ids: true, depth: 1 })];
  });
  return views.length === 0 ? `ok, type ${applied.type}` : `ok, type ${applied.type}, now ${views.join(" ")}`;
}

export type Change = { op?: string; id: string; expr?: string; index?: number };

// One edit as separate fields, for function calling: the model fills id and expr instead of writing an
// (edits ...) list, so the prompt needs no edit grammar. op defaults to replace.
export function change(session: Session, input: Change): string {
  const op = input.op === undefined || input.op.trim() === "" ? "replace" : input.op.trim();
  const id = input.id.trim();
  const expr = (input.expr ?? "").trim();
  if (op === "delete") return edit(session, `(edits (delete ${id}))`);
  if (expr === "") return `rejected: ${op} needs expr`;
  if (op === "rename") return rename(session, id, expr);
  if (op === "replace") return edit(session, `(edits (replace ${id} ${expr}))`);
  if (op === "insert") {
    if (input.index === undefined) return "rejected: insert needs index";
    return edit(session, `(edits (insert ${id} ${input.index} ${expr}))`);
  }
  return `rejected: unknown op ${op}; ops are replace insert delete rename`;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = new Set(["let", "fn", "if", "true", "false", ...KINDS]);

// Renames one binding and every use that resolves to it, following scopes: another binding with the same
// name, or a longer name that starts the same, is left alone. id is the let, or any use of the binding.
// Ids stay the same, since every node keeps its place.
export function rename(session: Session, id: string, to: string): string {
  if (!NAME.test(to) || RESERVED.has(to)) return `rejected: bad name ${to}`;
  let target: string | undefined;
  let from = "";
  let taken = false;
  scoped(session.tree, new Map(), (node, scope) => {
    if (names(node).includes(to)) taken = true;
    if (node.id !== id) return;
    if (node.kind === "let") {
      target = node.id;
      from = node.name;
    } else if (node.kind === "var") {
      target = scope.get(node.name);
      from = node.name;
    }
  });
  if (target === undefined) {
    return locate(session.tree, id) === undefined ? `unknown-id ${id}` : `rejected: ${id} is not a let or a bound use`;
  }
  if (taken) return `rejected: name ${to} is already used`;
  if (target.includes(":")) return "rejected: rename a function parameter by replacing its fn";
  let uses = 0;
  const tree = renamed(session.tree, new Map(), target, to, () => {
    uses += 1;
  });
  const checked = check(tree);
  if (!checked.ok) return `rejected: ${errorLine(checked.error, tree)}`;
  session.tree = tree;
  remember(session);
  return `ok, type ${checked.type}, renamed ${from} to ${to} and ${uses} uses`;
}

// Scope maps a name to its binder: a let id, or fn id and parameter like n4:x.
type Scope = ReadonlyMap<string, string>;

function scoped(node: Expr, scope: Scope, visit: (node: Expr, scope: Scope) => void): void {
  visit(node, scope);
  if (node.kind === "let") {
    scoped(node.value, scope, visit);
    scoped(node.body, new Map(scope).set(node.name, node.id), visit);
    return;
  }
  if (node.kind === "fn") {
    const inner = new Map(scope);
    for (const param of node.params) inner.set(param, `${node.id}:${param}`);
    scoped(node.body, inner, visit);
    return;
  }
  for (const kid of childrenOf(node)) scoped(kid, scope, visit);
}

function renamed(node: Expr, scope: Scope, target: string, to: string, used: () => void): Expr {
  const again = (kid: Expr, inner: Scope = scope): Expr => renamed(kid, inner, target, to, used);
  switch (node.kind) {
    case "num":
    case "bool":
      return node;
    case "var":
      if (scope.get(node.name) !== target) return node;
      used();
      return { ...node, name: to };
    case "let": {
      const inner = new Map(scope).set(node.name, node.id);
      return { ...node, name: node.id === target ? to : node.name, value: again(node.value), body: again(node.body, inner) };
    }
    case "fn": {
      const inner = new Map(scope);
      for (const param of node.params) inner.set(param, `${node.id}:${param}`);
      return { ...node, body: again(node.body, inner) };
    }
    case "call":
      return { ...node, callee: again(node.callee), args: node.args.map((arg) => again(arg)) };
    case "if":
      return { ...node, cond: again(node.cond), then: again(node.then), else: again(node.else) };
    default:
      return { ...node, left: again(node.left), right: again(node.right) };
  }
}

// Ids of the nodes that hold each edited spot, so the ok reply can show the change in place and the model
// can check it without another show. A replaced node gets a fresh id, so its parent is what survives.
function editedSpots(tree: Expr, text: string): string[] {
  const parents = new Map<string, string>();
  walk(tree, null, (node, parent) => {
    parents.set(node.id, parent === null ? node.id : parent.id);
  });
  const spots: string[] = [];
  for (const match of text.matchAll(/\(\s*(replace|insert|delete)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const op = match[1];
    const id = match[2];
    if (id === undefined) continue;
    const spot = op === "insert" ? id : parents.get(id);
    if (spot !== undefined && !spots.includes(spot)) spots.push(spot);
    if (spots.length >= MAX_SPOTS) break;
  }
  return spots;
}

export function printed(session: Session): string {
  return print(session.tree);
}

function filled(query: FindQuery): FindQuery {
  const out: FindQuery = {};
  if (query.text !== undefined && query.text.trim() !== "") out.text = query.text;
  if (query.kind !== undefined && query.kind.trim() !== "") out.kind = query.kind.trim();
  if (query.name !== undefined && query.name.trim() !== "") out.name = query.name.trim();
  if (query.limit !== undefined) out.limit = query.limit;
  return out;
}

function matches(node: Expr, query: FindQuery): boolean {
  if (query.kind !== undefined && node.kind !== query.kind) return false;
  if (query.name !== undefined && !names(node).includes(query.name)) return false;
  if (query.text !== undefined) {
    const text = query.text.trim();
    const leaf = childrenOf(node).length === 0;
    if (leaf === text.startsWith("(")) return false;
    if (compact(node) !== text) return false;
  }
  return query.kind !== undefined || query.name !== undefined || query.text !== undefined;
}

function names(node: Expr): string[] {
  if (node.kind === "var") return [node.name];
  if (node.kind === "let") return [node.name];
  if (node.kind === "fn") return node.params;
  return [];
}

function headOf(node: Expr): string {
  if (node.kind === "let") return `(let ${node.name} ...)`;
  if (node.kind === "fn") return `(fn (${node.params.join(" ")}) ...)`;
  if (node.kind === "call") return "(call ...)";
  return `(${node.kind} ...)`;
}

function walk(node: Expr, parent: Expr | null, visit: (node: Expr, parent: Expr | null) => void): void {
  const stack: Array<[Expr, Expr | null]> = [[node, parent]];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) break;
    const [current, above] = item;
    visit(current, above);
    const kids = childrenOf(current);
    for (let index = kids.length - 1; index >= 0; index -= 1) {
      const kid = kids[index];
      if (kid !== undefined) stack.push([kid, current]);
    }
  }
}

function locate(tree: Expr, id: string): { node: Expr } | undefined {
  let found: Expr | undefined;
  walk(tree, null, (node) => {
    if (found === undefined && node.id === id) found = node;
  });
  return found === undefined ? undefined : { node: found };
}

function remember(session: Session): void {
  walk(session.tree, null, (node) => {
    session.used.add(node.id);
  });
}

function count(tree: Expr): number {
  let total = 0;
  walk(tree, null, () => {
    total += 1;
  });
  return total;
}
