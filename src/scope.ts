import { childrenOf } from "./compact.ts";
import type { Expr } from "./ir.ts";
import { parse } from "./parse.ts";

// Tree walks and the two edits that follow scopes, rename and param. They only rebuild the tree: the caller
// runs the checker and says what changed, so the (edits ...) contract and the tools share one implementation.

export type ScopedResult =
  | { ok: true; tree: Expr; note: string }
  | { ok: false; unknown: boolean; message: string };

export const KINDS: readonly string[] = ["num", "bool", "var", "let", "fn", "call", "if", "add", "sub", "mul", "div", "eq", "lt", "gt", "lte", "gte"];

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESERVED = new Set(["let", "fn", "if", "true", "false", ...KINDS]);

// Renames one binding and every use that resolves to it, following scopes: another binding with the same
// name, or a longer name that starts the same, is left alone. id is the let, or any use of the binding.
// Ids stay the same, since every node keeps its place.
export function renameBinding(tree: Expr, id: string, to: string): ScopedResult {
  if (!NAME.test(to) || RESERVED.has(to)) return refuse(`bad name ${to}`);
  let target: string | undefined;
  let from = "";
  let taken = false;
  scoped(tree, new Map(), (node, scope) => {
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
    if (locate(tree, id) === undefined) return unknown(id);
    // Reading n1:(let rate n2:3 ...), models often take n2, the id right after the name, for the binding.
    let owner: Expr | undefined;
    walk(tree, null, (node, parent) => {
      if (node.id === id && parent?.kind === "let" && parent.value === node) owner = parent;
    });
    const hint = owner?.kind === "let" ? `; it is the value of ${owner.id}, the let of ${owner.name}` : "";
    return refuse(`${id} is not a let or a bound use${hint}`);
  }
  if (taken) return refuse(`name ${to} is already used`);
  if (target.includes(":")) return refuse("rename a function parameter by replacing its fn");
  let uses = 0;
  const next = renamed(tree, new Map(), target, to, () => {
    uses += 1;
  });
  return { ok: true, tree: next, note: `renamed ${from} to ${to} and ${uses} uses` };
}

// Adds a parameter to a let-bound function and passes expr at every call of it, in one step, so no call
// is left behind. id is the let, its fn, or any use of the function. index defaults to the end.
// New nodes take ids outside taken.
export function addParameter(tree: Expr, id: string, name: string, exprText: string, index: number | undefined, taken: Set<string>): ScopedResult {
  if (!NAME.test(name) || RESERVED.has(name)) return refuse(`bad name ${name}`);
  const parsed = parse(exprText);
  if (!parsed.ok) return refuse(`bad expr ${exprText}: ${parsed.error.message}`);
  let binder: Extract<Expr, { kind: "let" }> | undefined;
  scoped(tree, new Map(), (node, scope) => {
    if (node.kind === "let" && (node.id === id || node.value.id === id)) binder = node;
    if (node.kind === "var" && node.id === id) {
      const at = scope.get(node.name);
      if (at !== undefined) {
        const found = locate(tree, at);
        if (found?.kind === "let") binder = found;
      }
    }
  });
  if (binder === undefined) {
    return locate(tree, id) === undefined ? unknown(id) : refuse(`${id} is not a let-bound function or a use of one`);
  }
  const target = binder;
  const fn = target.value;
  if (fn.kind !== "fn") return refuse(`${target.name} is not bound to a fn`);
  const at = index ?? fn.params.length;
  if (!Number.isInteger(at) || at < 0 || at > fn.params.length) return refuse(`index ${at} is outside 0..${fn.params.length}`);
  let inside = false;
  walk(fn, null, (node) => {
    if (names(node).includes(name)) inside = true;
  });
  if (inside) return refuse(`name ${name} is already used in ${target.name}`);
  const calls = new Set<string>();
  const callees = new Set<string>();
  const loose: string[] = [];
  scoped(target.body, new Map([[target.name, target.id]]), (node, scope) => {
    if (node.kind === "call" && node.callee.kind === "var" && scope.get(node.callee.name) === target.id) {
      calls.add(node.id);
      callees.add(node.callee.id);
    }
    if (node.kind === "var" && scope.get(node.name) === target.id) loose.push(node.id);
  });
  const values = loose.filter((use) => !callees.has(use));
  if (values.length > 0) return refuse(`${target.name} is also used as a value at ${values.slice(0, 3).join(" ")}; change those uses first`);
  const params = [...fn.params.slice(0, at), name, ...fn.params.slice(at)];
  const fresh = new Set([...taken, ...collectIds(tree)]);
  const widened = rebuild(replaceNode(tree, fn.id, { ...fn, params }), (node) =>
    node.kind === "call" && calls.has(node.id)
      ? { ...node, args: [...node.args.slice(0, at), renumber(parsed.tree, fresh), ...node.args.slice(at)] }
      : node,
  );
  const what = calls.size === 0 ? "no calls to update" : `updated ${calls.size} calls`;
  return { ok: true, tree: widened, note: `${target.name} takes (${params.join(" ")}), ${what}` };
}

function refuse(message: string): ScopedResult {
  return { ok: false, unknown: false, message };
}

function unknown(id: string): ScopedResult {
  return { ok: false, unknown: true, message: `unknown-id ${id}` };
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

// Rebuilds the tree bottom-up, letting change swap any node once its children are rebuilt.
function rebuild(node: Expr, change: (node: Expr) => Expr): Expr {
  const again = (kid: Expr): Expr => rebuild(kid, change);
  switch (node.kind) {
    case "num":
    case "bool":
    case "var":
      return change(node);
    case "let":
      return change({ ...node, value: again(node.value), body: again(node.body) });
    case "fn":
      return change({ ...node, body: again(node.body) });
    case "call":
      return change({ ...node, callee: again(node.callee), args: node.args.map(again) });
    case "if":
      return change({ ...node, cond: again(node.cond), then: again(node.then), else: again(node.else) });
    default:
      return change({ ...node, left: again(node.left), right: again(node.right) });
  }
}

export function replaceNode(tree: Expr, id: string, next: Expr): Expr {
  return rebuild(tree, (node) => (node.id === id ? next : node));
}

// A copy of expr with fresh ids n1, n2, ... that skip every id in taken, which it then holds too.
export function renumber(expr: Expr, taken: Set<string>): Expr {
  let next = 1;
  const fresh = (): string => {
    while (taken.has(`n${next}`)) next += 1;
    const id = `n${next}`;
    taken.add(id);
    next += 1;
    return id;
  };
  const walkCopy = (node: Expr): Expr => {
    const id = fresh();
    switch (node.kind) {
      case "num":
        return { id, kind: "num", value: node.value };
      case "bool":
        return { id, kind: "bool", value: node.value };
      case "var":
        return { id, kind: "var", name: node.name };
      case "let":
        return { id, kind: "let", name: node.name, value: walkCopy(node.value), body: walkCopy(node.body) };
      case "fn":
        return { id, kind: "fn", params: [...node.params], body: walkCopy(node.body) };
      case "call":
        return { id, kind: "call", callee: walkCopy(node.callee), args: node.args.map((arg) => walkCopy(arg)) };
      case "if":
        return { id, kind: "if", cond: walkCopy(node.cond), then: walkCopy(node.then), else: walkCopy(node.else) };
      default:
        return { id, kind: node.kind, left: walkCopy(node.left), right: walkCopy(node.right) };
    }
  };
  return walkCopy(expr);
}

export function collectIds(expr: Expr, into = new Set<string>()): Set<string> {
  walk(expr, null, (node) => {
    into.add(node.id);
  });
  return into;
}

export function names(node: Expr): string[] {
  if (node.kind === "var") return [node.name];
  if (node.kind === "let") return [node.name];
  if (node.kind === "fn") return node.params;
  return [];
}

// Depth first, in source order, without recursion, so a long let chain cannot overflow the stack.
export function walk(node: Expr, parent: Expr | null, visit: (node: Expr, parent: Expr | null) => void): void {
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

export function locate(tree: Expr, id: string): Expr | undefined {
  let found: Expr | undefined;
  walk(tree, null, (node) => {
    if (found === undefined && node.id === id) found = node;
  });
  return found;
}
