import type { Expr } from "./ir.ts";

export type Layout = "inline" | "lines";

// "lines" starts the body of every let on its own line, so a long chain reads one binding per line.
// depth folds every list deeper than that level into its id followed by "...".
export function compact(expr: Expr, options?: { ids?: boolean; layout?: Layout; depth?: number }): string {
  const ids = options?.ids ?? false;
  const gap = options?.layout === "lines" ? "\n" : " ";
  const limit = options?.depth;
  const tag = (node: Expr, text: string): string => (ids ? `${node.id}:${text}` : text);
  let level = 0;
  const walk = (node: Expr): string => {
    if (limit !== undefined && level > limit && childrenOf(node).length > 0) return `${node.id}:...`;
    level += 1;
    const text = render(node);
    level -= 1;
    return text;
  };
  const render = (node: Expr): string => {
    switch (node.kind) {
      case "num":
        return tag(node, String(node.value));
      case "bool":
        return tag(node, node.value ? "true" : "false");
      case "var":
        return tag(node, node.name);
      case "add":
      case "sub":
      case "mul":
      case "div":
      case "eq":
      case "lt":
      case "gt":
      case "lte":
      case "gte":
        return tag(node, `(${node.kind} ${walk(node.left)} ${walk(node.right)})`);
      case "let":
        return tag(node, `(let ${node.name} ${walk(node.value)}${gap}${walk(node.body)})`);
      case "fn":
        return tag(node, `(fn (${node.params.join(" ")}) ${walk(node.body)})`);
      case "call":
        return tag(node, `(${[node.callee, ...node.args].map(walk).join(" ")})`);
      case "if":
        return tag(node, `(if ${walk(node.cond)} ${walk(node.then)} ${walk(node.else)})`);
    }
  };
  return walk(expr);
}

export function findNode(expr: Expr, id: string): Expr | undefined {
  if (expr.id === id) return expr;
  for (const child of childrenOf(expr)) {
    const found = findNode(child, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function snippet(expr: Expr, max = 80): string {
  const text = compact(expr);
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

export function childrenOf(expr: Expr): Expr[] {
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
