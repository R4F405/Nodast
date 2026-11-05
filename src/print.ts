import type { Expr } from "./ir.ts";

type Side = "left" | "right";
type Assoc = "left" | "right" | "none";

const OP: Record<"add" | "sub" | "mul" | "div" | "eq" | "lt" | "gt" | "lte" | "gte", string> = {
  add: "+",
  sub: "-",
  mul: "*",
  div: "/",
  eq: "===",
  lt: "<",
  gt: ">",
  lte: "<=",
  gte: ">=",
};

export function print(expr: Expr): string {
  const { bindings, result } = flatten(expr, new Set());
  const lines = bindings.map((binding) => `const ${binding.name} = ${printExpr(binding.value, "")};`);
  lines.push(`${asStatement(result)};`);
  return `${lines.join("\n")}\n`;
}

function asStatement(expr: Expr): string {
  const text = printExpr(expr, "");
  if (expr.kind === "fn") return `(${text})`;
  return text;
}

// Lets become const lines in one scope, which cannot declare a name twice or read a name in its own const.
// So the chain stops at a let that reuses a name already declared there, or whose value uses its own name;
// that let prints as an applied function instead, which gives it a fresh scope.
function flatten(expr: Expr, taken: ReadonlySet<string>): { bindings: { name: string; value: Expr }[]; result: Expr } {
  const bindings: { name: string; value: Expr }[] = [];
  const declared = new Set(taken);
  let current = expr;
  while (current.kind === "let" && !shadows(current, declared)) {
    bindings.push({ name: current.name, value: current.value });
    declared.add(current.name);
    current = current.body;
  }
  return { bindings, result: current };
}

function shadows(expr: Extract<Expr, { kind: "let" }>, declared: ReadonlySet<string>): boolean {
  return declared.has(expr.name) || mentions(expr.value, expr.name);
}

function mentions(expr: Expr, name: string): boolean {
  switch (expr.kind) {
    case "num":
    case "bool":
      return false;
    case "var":
      return expr.name === name;
    case "let":
      return mentions(expr.value, name) || mentions(expr.body, name);
    case "fn":
      return mentions(expr.body, name);
    case "call":
      return mentions(expr.callee, name) || expr.args.some((arg) => mentions(arg, name));
    case "if":
      return mentions(expr.cond, name) || mentions(expr.then, name) || mentions(expr.else, name);
    default:
      return mentions(expr.left, name) || mentions(expr.right, name);
  }
}

// (let k v body) as ((k) => body)(v): v is read in the outer scope and body sees the new k.
function printApplied(expr: Extract<Expr, { kind: "let" }>, indent: string): string {
  const fn = printFn({ id: expr.id, kind: "fn", params: [expr.name], body: expr.body }, indent);
  return `(${fn})(${printExpr(expr.value, indent)})`;
}

function printExpr(expr: Expr, indent: string): string {
  switch (expr.kind) {
    case "num":
      return String(expr.value);
    case "bool":
      return expr.value ? "true" : "false";
    case "var":
      return expr.name;
    case "add":
    case "sub":
    case "mul":
    case "div":
    case "eq":
    case "lt":
    case "gt":
    case "lte":
    case "gte":
      return `${wrap(expr.left, prec(expr), "left", assoc(expr), indent)} ${OP[expr.kind]} ${wrap(expr.right, prec(expr), "right", assoc(expr), indent)}`;
    case "if":
      return `${wrap(expr.cond, prec(expr), "left", "right", indent)} ? ${wrap(expr.then, prec(expr), "left", "right", indent)} : ${wrap(expr.else, prec(expr), "right", "right", indent)}`;
    case "call": {
      const callee = wrap(expr.callee, prec(expr), "left", "left", indent);
      const args = expr.args.map((arg) => printExpr(arg, indent)).join(", ");
      return `${callee}(${args})`;
    }
    case "fn":
      return printFn(expr, indent);
    case "let":
      return shadows(expr, new Set()) ? printApplied(expr, indent) : printIife(expr, indent);
  }
}

function printFn(expr: Extract<Expr, { kind: "fn" }>, indent: string): string {
  const head = `(${expr.params.join(", ")}) =>`;
  if (expr.body.kind === "let") {
    const inner = `${indent}  `;
    return `${head} {\n${printBody(expr.body, inner, new Set(expr.params))}\n${indent}}`;
  }
  return `${head} ${printExpr(expr.body, indent)}`;
}

function printIife(expr: Expr, indent: string): string {
  const inner = `${indent}  `;
  return `(() => {\n${printBody(expr, inner, new Set())}\n${indent}})()`;
}

function printBody(expr: Expr, indent: string, taken: ReadonlySet<string>): string {
  const { bindings, result } = flatten(expr, taken);
  const lines = bindings.map((binding) => `${indent}const ${binding.name} = ${printExpr(binding.value, indent)};`);
  lines.push(`${indent}return ${printExpr(result, indent)};`);
  return lines.join("\n");
}

function wrap(expr: Expr, parentPrec: number, side: Side, parentAssoc: Assoc, indent: string): string {
  const text = printExpr(expr, indent);
  return needsParen(prec(expr), parentPrec, side, parentAssoc) ? `(${text})` : text;
}

function needsParen(childPrec: number, parentPrec: number, side: Side, parentAssoc: Assoc): boolean {
  if (childPrec < parentPrec) return true;
  if (childPrec > parentPrec) return false;
  if (parentAssoc === "left" && side === "right") return true;
  if (parentAssoc === "right" && side === "left") return true;
  if (parentAssoc === "none") return true;
  return false;
}

function prec(expr: Expr): number {
  switch (expr.kind) {
    case "fn":
      return 0;
    case "if":
      return 1;
    case "eq":
    case "lt":
    case "gt":
    case "lte":
    case "gte":
      return 2;
    case "add":
    case "sub":
      return 3;
    case "mul":
    case "div":
      return 4;
    case "call":
    case "let":
      return 5;
    case "num":
    case "bool":
    case "var":
      return 6;
  }
}

function assoc(expr: Expr): Assoc {
  switch (expr.kind) {
    case "eq":
    case "lt":
    case "gt":
    case "lte":
    case "gte":
      return "none";
    case "if":
    case "fn":
      return "right";
    default:
      return "left";
  }
}
