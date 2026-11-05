import type { Expr } from "./ir.ts";

export type CheckError =
  | { code: "duplicate-id"; nodeId: string }
  | { code: "undefined-name"; nodeId: string; name: string }
  | { code: "type-mismatch"; nodeId: string; expected: string; actual: string }
  | { code: "arity-mismatch"; nodeId: string; expected: number; actual: number }
  | { code: "not-a-function"; nodeId: string; actual: string }
  | { code: "infinite-type"; nodeId: string; name: string };

export type CheckResult = { ok: true; type: string } | { ok: false; error: CheckError };

type TVar = { kind: "var"; id: number; name: string; nodeId: string };
type TFn = { kind: "fn"; params: Type[]; ret: Type };
type Type = { kind: "number" } | { kind: "bool" } | TFn | TVar;

const NUMBER: Type = { kind: "number" };
const BOOL: Type = { kind: "bool" };

// A let-bound name is generic over vars: each use gets fresh copies of them, so (let id (fn (x) x) ...)
// can be used on numbers and on bools. Parameters and other names have no vars.
type Scheme = { vars: ReadonlySet<number>; type: Type };
type Env = Map<string, Scheme>;

class CheckFailure extends Error {
  readonly detail: CheckError;

  constructor(detail: CheckError) {
    super(detail.code);
    this.name = "CheckFailure";
    this.detail = detail;
  }
}

class Checker {
  private nextVar = 0;
  private readonly bound = new Map<number, Type>();
  private readonly primitive = new Set<number>();

  assertUnique(expr: Expr, seen: Set<string>): void {
    if (seen.has(expr.id)) this.fail({ code: "duplicate-id", nodeId: expr.id });
    seen.add(expr.id);
    for (const child of children(expr)) this.assertUnique(child, seen);
  }

  infer(expr: Expr, env: Env): Type {
    switch (expr.kind) {
      case "num":
        return NUMBER;
      case "bool":
        return BOOL;
      case "var": {
        const found = env.get(expr.name);
        if (found === undefined) this.fail({ code: "undefined-name", nodeId: expr.id, name: expr.name });
        return this.instantiate(found);
      }
      case "add":
      case "sub":
      case "mul":
      case "div":
        return this.inferOperands(expr, env, NUMBER, NUMBER);
      case "lt":
      case "gt":
      case "lte":
      case "gte":
        return this.inferOperands(expr, env, NUMBER, BOOL);
      case "eq": {
        const left = this.infer(expr.left, env);
        const right = this.infer(expr.right, env);
        this.unify(left, right, expr.id);
        this.requirePrimitive(left, expr.id);
        return BOOL;
      }
      case "let": {
        const value = this.infer(expr.value, env);
        return this.infer(expr.body, extend(env, expr.name, this.generalize(value, env)));
      }
      case "fn": {
        let bodyEnv = env;
        const params: Type[] = [];
        for (const name of expr.params) {
          const param = this.fresh(name, expr.id);
          params.push(param);
          bodyEnv = extend(bodyEnv, name, { vars: NONE, type: param });
        }
        const ret = this.infer(expr.body, bodyEnv);
        return { kind: "fn", params, ret };
      }
      case "call":
        return this.inferCall(expr, env);
      case "if": {
        this.expect(this.infer(expr.cond, env), BOOL, expr.id);
        const thenType = this.infer(expr.then, env);
        const elseType = this.infer(expr.else, env);
        this.unify(thenType, elseType, expr.id);
        return thenType;
      }
    }
  }

  // Free vars print as a, b, c in order of first appearance, so (fn (f) (f 5)) is ((number) -> a) -> a.
  show(type: Type, names: Map<number, string> = new Map()): string {
    const root = this.resolve(type);
    switch (root.kind) {
      case "number":
        return "number";
      case "bool":
        return "bool";
      case "var": {
        let name = names.get(root.id);
        if (name === undefined) {
          name = letter(names.size);
          names.set(root.id, name);
        }
        return name;
      }
      case "fn": {
        const params = root.params.map((param) => this.show(param, names)).join(", ");
        return `(${params}) -> ${this.show(root.ret, names)}`;
      }
    }
  }

  private generalize(type: Type, env: Env): Scheme {
    const free = this.freeVars(type, new Set());
    if (free.size === 0) return { vars: NONE, type };
    const outside = new Set<number>();
    for (const scheme of env.values()) {
      for (const id of this.freeVars(scheme.type, new Set())) if (!scheme.vars.has(id)) outside.add(id);
    }
    for (const id of outside) free.delete(id);
    return { vars: free, type };
  }

  private instantiate(scheme: Scheme): Type {
    if (scheme.vars.size === 0) return scheme.type;
    const copies = new Map<number, TVar>();
    const copy = (type: Type): Type => {
      const root = this.resolve(type);
      if (root.kind === "fn") return { kind: "fn", params: root.params.map(copy), ret: copy(root.ret) };
      if (root.kind !== "var" || !scheme.vars.has(root.id)) return root;
      let fresh = copies.get(root.id);
      if (fresh === undefined) {
        fresh = this.fresh(root.name, root.nodeId);
        if (this.primitive.has(root.id)) this.primitive.add(fresh.id);
        copies.set(root.id, fresh);
      }
      return fresh;
    };
    return copy(scheme.type);
  }

  private freeVars(type: Type, into: Set<number>): Set<number> {
    const root = this.resolve(type);
    if (root.kind === "var") into.add(root.id);
    if (root.kind === "fn") {
      for (const param of root.params) this.freeVars(param, into);
      this.freeVars(root.ret, into);
    }
    return into;
  }

  private inferOperands(
    expr: Extract<Expr, { left: Expr; right: Expr }>,
    env: Env,
    operand: Type,
    result: Type,
  ): Type {
    this.expect(this.infer(expr.left, env), operand, expr.id);
    this.expect(this.infer(expr.right, env), operand, expr.id);
    return result;
  }

  private inferCall(expr: Extract<Expr, { kind: "call" }>, env: Env): Type {
    const callee = this.resolve(this.infer(expr.callee, env));
    const args = expr.args.map((arg) => this.infer(arg, env));
    if (callee.kind === "fn") {
      if (callee.params.length !== args.length) {
        this.fail({
          code: "arity-mismatch",
          nodeId: expr.id,
          expected: callee.params.length,
          actual: args.length,
        });
      }
      for (let index = 0; index < args.length; index += 1) {
        const param = callee.params[index];
        const arg = args[index];
        if (param === undefined || arg === undefined) {
          this.fail({
            code: "arity-mismatch",
            nodeId: expr.id,
            expected: callee.params.length,
            actual: args.length,
          });
        }
        this.unify(param, arg, expr.id);
      }
      return callee.ret;
    }
    if (callee.kind === "var") {
      const ret = this.fresh("result", expr.id);
      this.unify(callee, { kind: "fn", params: args, ret }, expr.id);
      return ret;
    }
    this.fail({ code: "not-a-function", nodeId: expr.id, actual: this.show(callee) });
  }

  private expect(actual: Type, expected: Type, nodeId: string): void {
    this.unify(expected, actual, nodeId);
  }

  private requirePrimitive(type: Type, nodeId: string): void {
    const root = this.resolve(type);
    if (root.kind === "number" || root.kind === "bool") return;
    if (root.kind === "var") {
      this.primitive.add(root.id);
      return;
    }
    this.fail({ code: "type-mismatch", nodeId, expected: "number | bool", actual: this.show(root) });
  }

  private unify(left: Type, right: Type, nodeId: string): void {
    const a = this.resolve(left);
    const b = this.resolve(right);
    if (a.kind === "var" && b.kind === "var" && a.id === b.id) return;
    if (a.kind === "var") return this.bind(a, b, nodeId);
    if (b.kind === "var") return this.bind(b, a, nodeId);
    if (a.kind === "number" && b.kind === "number") return;
    if (a.kind === "bool" && b.kind === "bool") return;
    if (a.kind === "fn" && b.kind === "fn") {
      if (a.params.length !== b.params.length) {
        this.fail({
          code: "arity-mismatch",
          nodeId,
          expected: a.params.length,
          actual: b.params.length,
        });
      }
      for (let index = 0; index < a.params.length; index += 1) {
        const param = a.params[index];
        const other = b.params[index];
        if (param === undefined || other === undefined) {
          this.fail({
            code: "arity-mismatch",
            nodeId,
            expected: a.params.length,
            actual: b.params.length,
          });
        }
        this.unify(param, other, nodeId);
      }
      this.unify(a.ret, b.ret, nodeId);
      return;
    }
    this.fail({ code: "type-mismatch", nodeId, expected: this.show(a), actual: this.show(b) });
  }

  private bind(variable: TVar, type: Type, nodeId: string): void {
    if (type.kind === "var" && type.id === variable.id) return;
    if (this.occurs(variable.id, type)) {
      this.fail({ code: "infinite-type", nodeId, name: variable.name });
    }
    const root = this.resolve(type);
    if (this.primitive.has(variable.id)) {
      if (root.kind === "number" || root.kind === "bool") this.primitive.delete(variable.id);
      else if (root.kind === "var") this.primitive.add(root.id);
      else this.fail({ code: "type-mismatch", nodeId, expected: "number | bool", actual: this.show(root) });
    }
    this.bound.set(variable.id, root);
  }

  private occurs(varId: number, type: Type): boolean {
    const root = this.resolve(type);
    if (root.kind === "var") return root.id === varId;
    if (root.kind !== "fn") return false;
    return root.params.some((param) => this.occurs(varId, param)) || this.occurs(varId, root.ret);
  }

  private resolve(type: Type): Type {
    if (type.kind !== "var") return type;
    const next = this.bound.get(type.id);
    if (next === undefined) return type;
    const root = this.resolve(next);
    if (root !== next) this.bound.set(type.id, root);
    return root;
  }

  private fresh(name: string, nodeId: string): TVar {
    const variable: TVar = { kind: "var", id: this.nextVar, name, nodeId };
    this.nextVar += 1;
    return variable;
  }

  private fail(detail: CheckError): never {
    throw new CheckFailure(detail);
  }
}

const NONE: ReadonlySet<number> = new Set();

function letter(index: number): string {
  const base = String.fromCharCode(97 + (index % 26));
  return index < 26 ? base : `${base}${Math.floor(index / 26)}`;
}

function extend(env: Env, name: string, scheme: Scheme): Env {
  const next = new Map(env);
  next.set(name, scheme);
  return next;
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

export function check(expr: Expr): CheckResult {
  const checker = new Checker();
  try {
    checker.assertUnique(expr, new Set());
    const type = checker.infer(expr, new Map());
    return { ok: true, type: checker.show(type) };
  } catch (error) {
    if (error instanceof CheckFailure) return { ok: false, error: error.detail };
    throw error;
  }
}
