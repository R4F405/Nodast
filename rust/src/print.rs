use crate::ir::{BinOp, Expr};

#[derive(Clone, Copy)]
enum Side {
    Left,
    Right,
}

#[derive(Clone, Copy)]
enum Assoc {
    Left,
    Right,
    None,
}

pub fn print(expr: &Expr) -> String {
    let (bindings, result) = flatten(expr);
    let mut lines: Vec<String> = bindings
        .iter()
        .map(|(name, value)| format!("const {name} = {};", print_expr(value, "")))
        .collect();
    lines.push(format!("{};", as_statement(result)));
    format!("{}\n", lines.join("\n"))
}

fn as_statement(expr: &Expr) -> String {
    let text = print_expr(expr, "");
    if matches!(expr, Expr::Fn { .. }) {
        format!("({text})")
    } else {
        text
    }
}

fn flatten(expr: &Expr) -> (Vec<(&str, &Expr)>, &Expr) {
    let mut bindings = Vec::new();
    let mut current = expr;
    while let Expr::Let { name, value, body, .. } = current {
        bindings.push((name.as_str(), value.as_ref()));
        current = body;
    }
    (bindings, current)
}

fn print_expr(expr: &Expr, indent: &str) -> String {
    match expr {
        Expr::Num { value, .. } => show_num(*value),
        Expr::Bool { value, .. } => if *value { "true" } else { "false" }.to_string(),
        Expr::Var { name, .. } => name.clone(),
        Expr::Bin { op, left, right, .. } => {
            let parent = prec(expr);
            let parent_assoc = assoc(expr);
            format!(
                "{} {} {}",
                wrap(left, parent, Side::Left, parent_assoc, indent),
                symbol(*op),
                wrap(right, parent, Side::Right, parent_assoc, indent)
            )
        }
        Expr::If { cond, then_branch, else_branch, .. } => {
            let parent = prec(expr);
            format!(
                "{} ? {} : {}",
                wrap(cond, parent, Side::Left, Assoc::Right, indent),
                wrap(then_branch, parent, Side::Left, Assoc::Right, indent),
                wrap(else_branch, parent, Side::Right, Assoc::Right, indent)
            )
        }
        Expr::Call { callee, args, .. } => {
            let callee = wrap(callee, prec(expr), Side::Left, Assoc::Left, indent);
            let args = args.iter().map(|arg| print_expr(arg, indent)).collect::<Vec<_>>().join(", ");
            format!("{callee}({args})")
        }
        Expr::Fn { .. } => print_fn(expr, indent),
        Expr::Let { .. } => print_iife(expr, indent),
    }
}

fn print_fn(expr: &Expr, indent: &str) -> String {
    let Expr::Fn { params, body, .. } = expr else { unreachable!() };
    let head = format!("({}) =>", params.join(", "));
    if matches!(body.as_ref(), Expr::Let { .. }) {
        let inner = format!("{indent}  ");
        format!("{head} {{\n{}\n{indent}}}", print_body(body, &inner))
    } else {
        format!("{head} {}", print_expr(body, indent))
    }
}

fn print_iife(expr: &Expr, indent: &str) -> String {
    let inner = format!("{indent}  ");
    format!("(() => {{\n{}\n{indent}}})()", print_body(expr, &inner))
}

fn print_body(expr: &Expr, indent: &str) -> String {
    let (bindings, result) = flatten(expr);
    let mut lines: Vec<String> = bindings
        .iter()
        .map(|(name, value)| format!("{indent}const {name} = {};", print_expr(value, indent)))
        .collect();
    lines.push(format!("{indent}return {};", print_expr(result, indent)));
    lines.join("\n")
}

fn wrap(expr: &Expr, parent_prec: u8, side: Side, parent_assoc: Assoc, indent: &str) -> String {
    let text = print_expr(expr, indent);
    if needs_paren(prec(expr), parent_prec, side, parent_assoc) {
        format!("({text})")
    } else {
        text
    }
}

fn needs_paren(child_prec: u8, parent_prec: u8, side: Side, parent_assoc: Assoc) -> bool {
    if child_prec < parent_prec {
        return true;
    }
    if child_prec > parent_prec {
        return false;
    }
    match (parent_assoc, side) {
        (Assoc::Left, Side::Right) | (Assoc::Right, Side::Left) | (Assoc::None, _) => true,
        _ => false,
    }
}

fn prec(expr: &Expr) -> u8 {
    match expr {
        Expr::Fn { .. } => 0,
        Expr::If { .. } => 1,
        Expr::Bin { op: BinOp::Eq | BinOp::Lt | BinOp::Gt | BinOp::Lte | BinOp::Gte, .. } => 2,
        Expr::Bin { op: BinOp::Add | BinOp::Sub, .. } => 3,
        Expr::Bin { op: BinOp::Mul | BinOp::Div, .. } => 4,
        Expr::Call { .. } | Expr::Let { .. } => 5,
        Expr::Num { .. } | Expr::Bool { .. } | Expr::Var { .. } => 6,
    }
}

fn assoc(expr: &Expr) -> Assoc {
    match expr {
        Expr::Bin { op: BinOp::Eq | BinOp::Lt | BinOp::Gt | BinOp::Lte | BinOp::Gte, .. } => Assoc::None,
        Expr::If { .. } | Expr::Fn { .. } => Assoc::Right,
        _ => Assoc::Left,
    }
}

fn symbol(op: BinOp) -> &'static str {
    match op {
        BinOp::Add => "+",
        BinOp::Sub => "-",
        BinOp::Mul => "*",
        BinOp::Div => "/",
        BinOp::Eq => "===",
        BinOp::Lt => "<",
        BinOp::Gt => ">",
        BinOp::Lte => "<=",
        BinOp::Gte => ">=",
    }
}

fn show_num(value: f64) -> String {
    if value.fract() == 0.0 && value.abs() < 1e15 {
        format!("{}", value as i64)
    } else {
        format!("{value}")
    }
}
