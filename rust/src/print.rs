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
    let (bindings, result) = flatten(expr, &[]);
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

// Lets become const lines in one scope, which cannot declare a name twice or read a name in its own const.
// So the chain stops at a let that reuses a name already declared there, or whose value uses its own name;
// that let prints as an applied function instead, which gives it a fresh scope.
fn flatten<'a>(expr: &'a Expr, taken: &[&str]) -> (Vec<(&'a str, &'a Expr)>, &'a Expr) {
    let mut bindings: Vec<(&str, &Expr)> = Vec::new();
    let mut declared: Vec<&str> = taken.to_vec();
    let mut current = expr;
    while let Expr::Let { name, value, body, .. } = current {
        if shadows(name, value, &declared) {
            break;
        }
        bindings.push((name.as_str(), value.as_ref()));
        declared.push(name.as_str());
        current = body;
    }
    (bindings, current)
}

fn shadows(name: &str, value: &Expr, declared: &[&str]) -> bool {
    declared.contains(&name) || mentions(value, name)
}

fn mentions(expr: &Expr, name: &str) -> bool {
    match expr {
        Expr::Num { .. } | Expr::Bool { .. } => false,
        Expr::Var { name: used, .. } => used == name,
        Expr::Bin { left, right, .. } => mentions(left, name) || mentions(right, name),
        Expr::Let { value, body, .. } => mentions(value, name) || mentions(body, name),
        Expr::Fn { body, .. } => mentions(body, name),
        Expr::Call { callee, args, .. } => mentions(callee, name) || args.iter().any(|arg| mentions(arg, name)),
        Expr::If { cond, then_branch, else_branch, .. } => {
            mentions(cond, name) || mentions(then_branch, name) || mentions(else_branch, name)
        }
    }
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
        Expr::Fn { params, body, .. } => print_arrow(params, body, indent),
        Expr::Let { name, value, body, .. } => {
            if shadows(name, value, &[]) {
                // (let k v body) as ((k) => body)(v): v is read in the outer scope and body sees the new k.
                let arrow = print_arrow(std::slice::from_ref(name), body, indent);
                format!("({arrow})({})", print_expr(value, indent))
            } else {
                print_iife(expr, indent)
            }
        }
    }
}

fn print_arrow(params: &[String], body: &Expr, indent: &str) -> String {
    let head = format!("({}) =>", params.join(", "));
    if matches!(body, Expr::Let { .. }) {
        let inner = format!("{indent}  ");
        let taken: Vec<&str> = params.iter().map(String::as_str).collect();
        format!("{head} {{\n{}\n{indent}}}", print_body(body, &inner, &taken))
    } else {
        format!("{head} {}", print_expr(body, indent))
    }
}

fn print_iife(expr: &Expr, indent: &str) -> String {
    let inner = format!("{indent}  ");
    format!("(() => {{\n{}\n{indent}}})()", print_body(expr, &inner, &[]))
}

fn print_body(expr: &Expr, indent: &str, taken: &[&str]) -> String {
    let (bindings, result) = flatten(expr, taken);
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
