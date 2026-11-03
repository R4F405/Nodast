import type { Expr } from "./ir.ts";

export type Edit =
  | { op: "replace"; id: string; node: Expr }
  | { op: "delete"; id: string }
  | { op: "insert"; id: string; index: number; node: Expr };

export type EditError =
  | { code: "unknown-id"; id: string; at: number }
  | { code: "cannot-delete"; id: string; at: number }
  | { code: "cannot-insert"; id: string; at: number }
  | { code: "index-out-of-range"; id: string; at: number; index: number; length: number }
  | { code: "duplicate-id"; id: string; at: number };

export type ApplyResult = { ok: true; tree: Expr } | { ok: false; error: EditError };

type Field = "left" | "right" | "value" | "body" | "callee" | "cond" | "then" | "else";

type ParentRef = { parent: Expr; field: Field } | { parent: Expr; field: "args"; index: number };

type Spot = { node: Expr; parent: ParentRef | null };

export function applyEdits(tree: Expr, edits: readonly Edit[]): ApplyResult {
  let draft = clone(tree);
  for (let at = 0; at < edits.length; at += 1) {
    const edit = edits[at];
    if (edit === undefined) continue;
    const applied = applyOne(draft, indexTree(draft), edit, at);
    if (!applied.ok) return applied;
    draft = applied.tree;
    const duplicate = duplicateId(draft);
    if (duplicate !== undefined) return { ok: false, error: { code: "duplicate-id", id: duplicate, at } };
  }
  return { ok: true, tree: draft };
}

function applyOne(draft: Expr, spots: Map<string, Spot>, edit: Edit, at: number): ApplyResult {
  const spot = spots.get(edit.id);
  if (spot === undefined) return { ok: false, error: { code: "unknown-id", id: edit.id, at } };

  if (edit.op === "replace") {
    const node = clone(edit.node);
    if (spot.parent === null) return { ok: true, tree: node };
    writeChild(spot.parent, node);
    return { ok: true, tree: draft };
  }

  if (edit.op === "delete") {
    if (spot.parent === null || spot.parent.field !== "args" || spot.parent.parent.kind !== "call") {
      return { ok: false, error: { code: "cannot-delete", id: edit.id, at } };
    }
    spot.parent.parent.args.splice(spot.parent.index, 1);
    return { ok: true, tree: draft };
  }

  if (spot.node.kind !== "call") return { ok: false, error: { code: "cannot-insert", id: edit.id, at } };
  const length = spot.node.args.length;
  if (!Number.isInteger(edit.index) || edit.index < 0 || edit.index > length) {
    return {
      ok: false,
      error: { code: "index-out-of-range", id: edit.id, at, index: edit.index, length },
    };
  }
  spot.node.args.splice(edit.index, 0, clone(edit.node));
  return { ok: true, tree: draft };
}

function indexTree(root: Expr): Map<string, Spot> {
  const spots = new Map<string, Spot>();
  const visit = (node: Expr, parent: ParentRef | null): void => {
    if (!spots.has(node.id)) spots.set(node.id, { node, parent });
    switch (node.kind) {
      case "num":
      case "bool":
      case "var":
        return;
      case "add":
      case "sub":
      case "mul":
      case "div":
      case "eq":
      case "lt":
      case "gt":
      case "lte":
      case "gte":
        visit(node.left, { parent: node, field: "left" });
        visit(node.right, { parent: node, field: "right" });
        return;
      case "let":
        visit(node.value, { parent: node, field: "value" });
        visit(node.body, { parent: node, field: "body" });
        return;
      case "fn":
        visit(node.body, { parent: node, field: "body" });
        return;
      case "call":
        visit(node.callee, { parent: node, field: "callee" });
        node.args.forEach((arg, index) => visit(arg, { parent: node, field: "args", index }));
        return;
      case "if":
        visit(node.cond, { parent: node, field: "cond" });
        visit(node.then, { parent: node, field: "then" });
        visit(node.else, { parent: node, field: "else" });
        return;
    }
  };
  visit(root, null);
  return spots;
}

function writeChild(ref: ParentRef, node: Expr): void {
  if (ref.field === "args") {
    if (ref.parent.kind === "call") ref.parent.args[ref.index] = node;
    return;
  }
  const parent = ref.parent;
  switch (parent.kind) {
    case "add":
    case "sub":
    case "mul":
    case "div":
    case "eq":
    case "lt":
    case "gt":
    case "lte":
    case "gte":
      if (ref.field === "left") parent.left = node;
      if (ref.field === "right") parent.right = node;
      return;
    case "let":
      if (ref.field === "value") parent.value = node;
      if (ref.field === "body") parent.body = node;
      return;
    case "fn":
      if (ref.field === "body") parent.body = node;
      return;
    case "call":
      if (ref.field === "callee") parent.callee = node;
      return;
    case "if":
      if (ref.field === "cond") parent.cond = node;
      if (ref.field === "then") parent.then = node;
      if (ref.field === "else") parent.else = node;
      return;
    default:
      return;
  }
}

function duplicateId(expr: Expr, seen = new Set<string>()): string | undefined {
  if (seen.has(expr.id)) return expr.id;
  seen.add(expr.id);
  for (const child of children(expr)) {
    const found = duplicateId(child, seen);
    if (found !== undefined) return found;
  }
  return undefined;
}

function children(expr: Expr): Expr[] {
  switch (expr.kind) {
    case "num":
    case "bool":
    case "var":
      return [];
    case "add":
    case "sub":
    case "mul":
    case "div":
    case "eq":
    case "lt":
    case "gt":
    case "lte":
    case "gte":
      return [expr.left, expr.right];
    case "let":
      return [expr.value, expr.body];
    case "fn":
      return [expr.body];
    case "call":
      return [expr.callee, ...expr.args];
    case "if":
      return [expr.cond, expr.then, expr.else];
  }
}

function clone(expr: Expr): Expr {
  return structuredClone(expr);
}
