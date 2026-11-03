export type NodeId = string;

export type Expr =
  | { id: NodeId; kind: "num"; value: number }
  | { id: NodeId; kind: "bool"; value: boolean }
  | { id: NodeId; kind: "var"; name: string }
  | { id: NodeId; kind: "add" | "sub" | "mul" | "div"; left: Expr; right: Expr }
  | { id: NodeId; kind: "eq" | "lt" | "gt" | "lte" | "gte"; left: Expr; right: Expr }
  | { id: NodeId; kind: "let"; name: string; value: Expr; body: Expr }
  | { id: NodeId; kind: "fn"; params: string[]; body: Expr }
  | { id: NodeId; kind: "call"; callee: Expr; args: Expr[] }
  | { id: NodeId; kind: "if"; cond: Expr; then: Expr; else: Expr };

export type SourcePosition = {
  offset: number;
  line: number;
  column: number;
};

export type ParseError = {
  message: string;
  position: SourcePosition;
};

export type ParseResult =
  | { ok: true; tree: Expr }
  | { ok: false; error: ParseError };
