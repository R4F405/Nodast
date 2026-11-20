import { check } from "./check.ts";
import { childrenOf, compact } from "./compact.ts";
import { applyEditText, errorLine } from "./contract.ts";
import type { Expr } from "./ir.ts";
import { parse } from "./parse.ts";
import { print } from "./print.ts";
import { addParameter, KINDS, locate, names, renameBinding, walk, type ScopedResult } from "./scope.ts";

// The calls a model makes to work on one program without reading all of it.
// Every reply is short plain text, so it costs little context and reads the same through MCP, a CLI or function calling.

export type ToolName = "find" | "show" | "edit";
export const TOOL_NAMES: readonly ToolName[] = ["find", "show", "edit"];

// used holds every id the session has had, so an edit never gives a new node an id the model saw on another node.
// tools, when set, is the list of calls the session answers; the others are refused. Absent means all of them.
export type Session = { tree: Expr; used: Set<string>; tools?: readonly ToolName[] };

export type OpenOptions = { tools?: readonly ToolName[] };

export type FindQuery = { text?: string; kind?: string; name?: string; limit?: number };

// Kind names models reach for that are not the node kinds.
const KIND_ALIASES: Record<string, string> = { number: "num", boolean: "bool", variable: "var", name: "var", function: "fn", lambda: "fn" };

const DEFAULT_LIMIT = 10;
const SHOW_DEPTH = 2;
const MAX_SPOTS = 3;
// An ok edit shows each changed spot two levels deep, so a replaced fn body or let value reads whole and the
// model has no reason to call show to check it.
const SPOT_DEPTH = 2;

export function open(source: string, options: OpenOptions = {}): { ok: true; session: Session; summary: string } | { ok: false; error: string } {
  const parsed = parse(source);
  if (!parsed.ok) {
    return { ok: false, error: `parse ${parsed.error.position.line}:${parsed.error.position.column} ${parsed.error.message}` };
  }
  const checked = check(parsed.tree);
  if (!checked.ok) return { ok: false, error: errorLine(checked.error, parsed.tree) };
  const unknown = options.tools?.find((name) => !TOOL_NAMES.includes(name));
  if (unknown !== undefined) return { ok: false, error: `unknown tool ${unknown}; tools are ${TOOL_NAMES.join(" ")}` };
  const session: Session = { tree: parsed.tree, used: new Set<string>() };
  if (options.tools !== undefined) session.tools = [...options.tools];
  remember(session);
  return { ok: true, session, summary: summary(session) };
}

// The whole program with ids, one let per line, when it has at most maxNodes nodes. Small programs cost less
// to show once than to explore with find and show over several model calls.
export function view(session: Session, maxNodes: number): string | undefined {
  if (count(session.tree) > maxNodes) return undefined;
  return compact(session.tree, { ids: true, layout: "lines" });
}

// The tools worth offering a model for this session. When the program is small enough for view to show it whole,
// there is nothing left to find or show, and a model offered those calls spends turns re-reading what it already
// has, so only edit remains. Larger programs get all three.
export function toolsFor(session: Session, maxNodes: number): ToolName[] {
  return count(session.tree) <= maxNodes ? ["edit"] : [...TOOL_NAMES];
}

// Whether the session answers this call.
export function offers(session: Session, name: string): boolean {
  return (session.tools ?? TOOL_NAMES).includes(name as ToolName);
}

function refused(session: Session, name: ToolName): string | undefined {
  if (offers(session, name)) return undefined;
  const tools = session.tools ?? [];
  return `${name} is not offered in this session; tools are ${tools.length === 0 ? "none" : tools.join(" ")}`;
}

export function summary(session: Session): string {
  const checked = check(session.tree);
  const type = checked.ok ? checked.type : "invalid";
  return `root ${session.tree.id}, ${count(session.tree)} nodes, type ${type}`;
}

// Matches nodes by exact compact text (like 70050 or (add v4 70005)), by kind, or by a bound or used name.
// A bare name as text also finds the let that binds it, since models look a binding up by its name.
// Each hit is shown inside its parent, one level deep, so the model can edit right after without a show call.
// Empty or blank fields count as absent: some models fill every parameter of a tool, sending "" for the ones they skip.
export function find(session: Session, raw: FindQuery): string {
  return refused(session, "find") ?? search(session, raw);
}

function search(session: Session, raw: FindQuery): string {
  const query = filled(raw);
  if (query.kind !== undefined) query.kind = KIND_ALIASES[query.kind] ?? query.kind;
  if (query.kind !== undefined && !KINDS.includes(query.kind)) return `unknown kind ${query.kind}; kinds are ${KINDS.join(" ")}`;
  if (query.text === undefined && query.kind === undefined && query.name === undefined) return "empty query; give text, kind or name";
  const limit = query.limit ?? DEFAULT_LIMIT;
  const hits: string[] = [];
  let total = 0;
  walk(session.tree, null, (node, parent) => {
    const binds = node.kind === "let" && query.kind === undefined && query.name === undefined && node.name === query.text?.trim();
    if (!binds && !matches(node, query)) return;
    total += 1;
    if (hits.length >= limit) return;
    const self = compact(node, { ids: true, depth: 1 });
    // A let already shows its value and body, and its parent is only the let before it.
    hits.push(parent === null || node.kind === "let" ? self : `${self} in ${compact(parent, { ids: true, depth: 1 })}`);
  });
  if (total === 0) return "no match";
  const more = total > hits.length ? `\n${total - hits.length} more; narrow the query` : "";
  return `${hits.join("\n")}${more}`;
}

export function show(session: Session, id: string, depth = SHOW_DEPTH): string {
  const no = refused(session, "show");
  if (no !== undefined) return no;
  const node = locate(session.tree, id);
  if (node === undefined) return `unknown-id ${id}`;
  return compact(node, { ids: true, depth });
}

// Applies an (edits ...) list. On success the session moves to the new tree; on failure it stays as it was.
// Bare operations like (replace n4 7) or several of them are wrapped in (edits ...), since models often drop it.
export function edit(session: Session, text: string): string {
  const no = refused(session, "edit");
  if (no !== undefined) return no;
  const trimmed = text.trim();
  const bare = /^\(\s*(replace|insert|delete|rename|param)\b/.test(trimmed);
  const applied = applyEditText(session.tree, bare ? `(edits ${trimmed})` : trimmed, session.used);
  if (!applied.ok) return `rejected: ${errorLine(applied.error, applied.tree)}`;
  const around = editedSpots(session.tree, trimmed);
  session.tree = applied.tree;
  remember(session);
  const views = around.flatMap((id) => {
    const found = locate(session.tree, id);
    return found === undefined ? [] : [compact(found, { ids: true, depth: SPOT_DEPTH })];
  });
  return views.length === 0 ? `ok, type ${applied.type}` : `ok, type ${applied.type}, now ${views.join(" ")}`;
}

export type Change = { op?: string; id: string; expr?: string; index?: number; name?: string; text?: string };

// One edit as separate fields, for function calling: the model fills id and expr instead of writing an
// (edits ...) list, so the prompt needs no edit grammar. op defaults to replace.
export function change(session: Session, input: Change): string {
  const no = refused(session, "edit");
  if (no !== undefined) return no;
  const op = input.op === undefined || input.op.trim() === "" ? "replace" : input.op.trim();
  let id = input.id.trim();
  // A node can be named by its exact text instead of its id, so a model that knows what to change but not
  // where skips the find call. More than one match is refused with the candidates, which then act as a find.
  const text = (input.text ?? "").trim();
  if (id === "" && text !== "") {
    const hits: string[] = [];
    walk(session.tree, null, (node) => {
      if (matches(node, { text })) hits.push(node.id);
    });
    if (hits.length === 0) return `rejected: no node is exactly ${text}`;
    if (hits.length > 1) return `rejected: ${hits.length} nodes are ${text}; pick an id:\n${search(session, { text })}`;
    id = hits[0] ?? "";
  }
  const expr = (input.expr ?? "").trim();
  const name = (input.name ?? "").trim();
  if (op === "delete") return edit(session, `(edits (delete ${id}))`);
  // rename takes the new name in name; older callers put it in expr.
  if (op === "rename") return rename(session, id, name === "" ? expr : name);
  if (expr === "") return `rejected: ${op} needs expr`;
  if (op === "param") {
    if (name === "") return "rejected: param needs name";
    return addParam(session, id, name, expr, input.index);
  }
  if (op === "replace") return edit(session, `(edits (replace ${id} ${expr}))`);
  if (op === "insert") {
    if (input.index === undefined) return "rejected: insert needs index";
    return edit(session, `(edits (insert ${id} ${input.index} ${expr}))`);
  }
  return `rejected: unknown op ${op}; ops are replace insert delete rename param`;
}

// Adds a parameter to a let-bound function and passes expr at every call of it. See scope.ts.
export function addParam(session: Session, id: string, name: string, expr: string, index?: number): string {
  const no = refused(session, "edit");
  if (no !== undefined) return no;
  return commit(session, addParameter(session.tree, id, name, expr, index, session.used));
}

// Renames one binding and every use that resolves to it, following scopes. See scope.ts.
export function rename(session: Session, id: string, to: string): string {
  const no = refused(session, "edit");
  if (no !== undefined) return no;
  return commit(session, renameBinding(session.tree, id, to));
}

// Checks the tree a scoped edit built and moves the session to it only when the checker accepts it.
function commit(session: Session, result: ScopedResult): string {
  if (!result.ok) return result.unknown ? result.message : `rejected: ${result.message}`;
  const checked = check(result.tree);
  if (!checked.ok) return `rejected: ${errorLine(checked.error, result.tree)}`;
  session.tree = result.tree;
  remember(session);
  return `ok, type ${checked.type}, ${result.note}`;
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
