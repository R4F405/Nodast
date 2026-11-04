import { check } from "./check.ts";
import { childrenOf, compact } from "./compact.ts";
import { applyEditText, errorLine } from "./contract.ts";
import type { Expr } from "./ir.ts";
import { parse } from "./parse.ts";
import { print } from "./print.ts";

// The calls a model makes to work on one program without reading all of it.
// Every reply is short plain text, so it costs little context and reads the same through MCP, a CLI or function calling.

export type Session = { tree: Expr };

export type FindQuery = { text?: string; kind?: string; name?: string; limit?: number };

const DEFAULT_LIMIT = 10;
const SHOW_DEPTH = 2;

export function open(source: string): { ok: true; session: Session; summary: string } | { ok: false; error: string } {
  const parsed = parse(source);
  if (!parsed.ok) {
    return { ok: false, error: `parse ${parsed.error.position.line}:${parsed.error.position.column} ${parsed.error.message}` };
  }
  const checked = check(parsed.tree);
  if (!checked.ok) return { ok: false, error: errorLine(checked.error, parsed.tree) };
  const session = { tree: parsed.tree };
  return { ok: true, session, summary: summary(session) };
}

export function summary(session: Session): string {
  const checked = check(session.tree);
  const type = checked.ok ? checked.type : "invalid";
  return `root ${session.tree.id}, ${count(session.tree)} nodes, type ${type}`;
}

// Matches nodes by exact compact text (like 70050 or (add v4 70005)), by kind, or by a bound or used name.
export function find(session: Session, query: FindQuery): string {
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
  const applied = applyEditText(session.tree, bare ? `(edits ${trimmed})` : trimmed);
  if (!applied.ok) return `rejected: ${errorLine(applied.error, applied.tree)}`;
  session.tree = applied.tree;
  return `ok, type ${applied.type}`;
}

export function printed(session: Session): string {
  return print(session.tree);
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

function count(tree: Expr): number {
  let total = 0;
  walk(tree, null, () => {
    total += 1;
  });
  return total;
}
