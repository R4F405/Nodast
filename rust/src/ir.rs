#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BinOp {
    Add,
    Sub,
    Mul,
    Div,
    Eq,
    Lt,
    Gt,
    Lte,
    Gte,
}

impl BinOp {
    pub fn name(self) -> &'static str {
        match self {
            BinOp::Add => "add",
            BinOp::Sub => "sub",
            BinOp::Mul => "mul",
            BinOp::Div => "div",
            BinOp::Eq => "eq",
            BinOp::Lt => "lt",
            BinOp::Gt => "gt",
            BinOp::Lte => "lte",
            BinOp::Gte => "gte",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Expr {
    Num { id: String, value: f64 },
    Bool { id: String, value: bool },
    Var { id: String, name: String },
    Bin { id: String, op: BinOp, left: Box<Expr>, right: Box<Expr> },
    Let { id: String, name: String, value: Box<Expr>, body: Box<Expr> },
    Fn { id: String, params: Vec<String>, body: Box<Expr> },
    Call { id: String, callee: Box<Expr>, args: Vec<Expr> },
    If { id: String, cond: Box<Expr>, then_branch: Box<Expr>, else_branch: Box<Expr> },
}

impl Expr {
    pub fn id(&self) -> &str {
        match self {
            Expr::Num { id, .. }
            | Expr::Bool { id, .. }
            | Expr::Var { id, .. }
            | Expr::Bin { id, .. }
            | Expr::Let { id, .. }
            | Expr::Fn { id, .. }
            | Expr::Call { id, .. }
            | Expr::If { id, .. } => id,
        }
    }

    pub fn children(&self) -> Vec<&Expr> {
        match self {
            Expr::Num { .. } | Expr::Bool { .. } | Expr::Var { .. } => Vec::new(),
            Expr::Bin { left, right, .. } => vec![left, right],
            Expr::Let { value, body, .. } => vec![value, body],
            Expr::Fn { body, .. } => vec![body],
            Expr::Call { callee, args, .. } => {
                let mut nodes = vec![callee.as_ref()];
                nodes.extend(args.iter());
                nodes
            }
            Expr::If { cond, then_branch, else_branch, .. } => vec![cond, then_branch, else_branch],
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SourcePosition {
    pub offset: usize,
    pub line: usize,
    pub column: usize,
}
