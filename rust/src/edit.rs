use std::collections::HashSet;

use crate::ir::Expr;

#[derive(Clone, Debug, PartialEq)]
pub enum Edit {
    Replace { id: String, node: Expr },
    Delete { id: String },
    Insert { id: String, index: usize, node: Expr },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EditError {
    UnknownId { id: String, at: usize },
    CannotDelete { id: String, at: usize },
    CannotInsert { id: String, at: usize },
    IndexOutOfRange { id: String, at: usize, index: usize, length: usize },
    DuplicateId { id: String, at: usize },
}

enum Step {
    Left,
    Right,
    Value,
    Body,
    Callee,
    Arg(usize),
    Cond,
    Then,
    Else,
}

pub fn apply_edits(tree: &Expr, edits: &[Edit]) -> Result<Expr, EditError> {
    let mut draft = tree.clone();
    for (at, edit) in edits.iter().enumerate() {
        draft = apply_one(draft, edit, at)?;
        if let Some(id) = duplicate_id(&draft, &mut HashSet::new()) {
            return Err(EditError::DuplicateId { id, at });
        }
    }
    Ok(draft)
}

fn apply_one(draft: Expr, edit: &Edit, at: usize) -> Result<Expr, EditError> {
    let id = match edit {
        Edit::Replace { id, .. } | Edit::Delete { id } | Edit::Insert { id, .. } => id,
    };
    let Some(path) = locate(&draft, id) else {
        return Err(EditError::UnknownId { id: id.clone(), at });
    };
    match edit {
        Edit::Replace { node, .. } => Ok(replace_at(draft, &path, node.clone())),
        Edit::Delete { id } => delete_at(draft, &path, id, at),
        Edit::Insert { id, index, node } => insert_at(draft, &path, *index, node.clone(), id, at),
    }
}

fn locate(node: &Expr, id: &str) -> Option<Vec<Step>> {
    if node.id() == id {
        return Some(Vec::new());
    }
    for (step, child) in steps(node) {
        if let Some(mut rest) = locate(child, id) {
            let mut path = vec![step];
            path.append(&mut rest);
            return Some(path);
        }
    }
    None
}

fn steps(node: &Expr) -> Vec<(Step, &Expr)> {
    match node {
        Expr::Num { .. } | Expr::Bool { .. } | Expr::Var { .. } => Vec::new(),
        Expr::Bin { left, right, .. } => vec![(Step::Left, left), (Step::Right, right)],
        Expr::Let { value, body, .. } => vec![(Step::Value, value), (Step::Body, body)],
        Expr::Fn { body, .. } => vec![(Step::Body, body)],
        Expr::Call { callee, args, .. } => {
            let mut found = vec![(Step::Callee, callee.as_ref())];
            found.extend(args.iter().enumerate().map(|(index, arg)| (Step::Arg(index), arg)));
            found
        }
        Expr::If { cond, then_branch, else_branch, .. } => {
            vec![(Step::Cond, cond.as_ref()), (Step::Then, then_branch.as_ref()), (Step::Else, else_branch.as_ref())]
        }
    }
}

fn replace_at(node: Expr, path: &[Step], new_node: Expr) -> Expr {
    if path.is_empty() {
        return new_node;
    }
    let (child, rebuild) = take(node, &path[0]);
    rebuild(replace_at(child, &path[1..], new_node))
}

fn delete_at(node: Expr, path: &[Step], id: &str, at: usize) -> Result<Expr, EditError> {
    let Some((step, rest)) = path.split_first() else {
        return Err(EditError::CannotDelete { id: id.to_string(), at });
    };
    if rest.is_empty() {
        let Expr::Call { id: call_id, callee, mut args } = node else {
            return Err(EditError::CannotDelete { id: id.to_string(), at });
        };
        let Step::Arg(index) = step else {
            return Err(EditError::CannotDelete { id: id.to_string(), at });
        };
        if *index >= args.len() {
            return Err(EditError::CannotDelete { id: id.to_string(), at });
        }
        args.remove(*index);
        return Ok(Expr::Call { id: call_id, callee, args });
    }
    let (child, rebuild) = take(node, step);
    Ok(rebuild(delete_at(child, rest, id, at)?))
}

fn insert_at(node: Expr, path: &[Step], index: usize, new_node: Expr, id: &str, at: usize) -> Result<Expr, EditError> {
    if path.is_empty() {
        let Expr::Call { id: call_id, callee, mut args } = node else {
            return Err(EditError::CannotInsert { id: id.to_string(), at });
        };
        if index > args.len() {
            return Err(EditError::IndexOutOfRange { id: id.to_string(), at, index, length: args.len() });
        }
        args.insert(index, new_node);
        return Ok(Expr::Call { id: call_id, callee, args });
    }
    let (child, rebuild) = take(node, &path[0]);
    Ok(rebuild(insert_at(child, &path[1..], index, new_node, id, at)?))
}

fn take(node: Expr, step: &Step) -> (Expr, Box<dyn FnOnce(Expr) -> Expr>) {
    match (node, step) {
        (Expr::Bin { id, op, left, right }, Step::Left) => {
            (*left, Box::new(move |child| Expr::Bin { id, op, left: Box::new(child), right }))
        }
        (Expr::Bin { id, op, left, right }, Step::Right) => {
            (*right, Box::new(move |child| Expr::Bin { id, op, left, right: Box::new(child) }))
        }
        (Expr::Let { id, name, value, body }, Step::Value) => {
            (*value, Box::new(move |child| Expr::Let { id, name, value: Box::new(child), body }))
        }
        (Expr::Let { id, name, value, body }, Step::Body) => {
            (*body, Box::new(move |child| Expr::Let { id, name, value, body: Box::new(child) }))
        }
        (Expr::Fn { id, params, body }, Step::Body) => {
            (*body, Box::new(move |child| Expr::Fn { id, params, body: Box::new(child) }))
        }
        (Expr::Call { id, callee, args }, Step::Callee) => {
            (*callee, Box::new(move |child| Expr::Call { id, callee: Box::new(child), args }))
        }
        (Expr::Call { id, callee, mut args }, Step::Arg(index)) => {
            let child = args.remove(*index);
            let slot = *index;
            (child, Box::new(move |child| {
                args.insert(slot, child);
                Expr::Call { id, callee, args }
            }))
        }
        (Expr::If { id, cond, then_branch, else_branch }, Step::Cond) => {
            (*cond, Box::new(move |child| Expr::If { id, cond: Box::new(child), then_branch, else_branch }))
        }
        (Expr::If { id, cond, then_branch, else_branch }, Step::Then) => (
            *then_branch,
            Box::new(move |child| Expr::If { id, cond, then_branch: Box::new(child), else_branch }),
        ),
        (Expr::If { id, cond, then_branch, else_branch }, Step::Else) => (
            *else_branch,
            Box::new(move |child| Expr::If { id, cond, then_branch, else_branch: Box::new(child) }),
        ),
        (node, _) => (node, Box::new(|child| child)),
    }
}

fn duplicate_id(expr: &Expr, seen: &mut HashSet<String>) -> Option<String> {
    if !seen.insert(expr.id().to_string()) {
        return Some(expr.id().to_string());
    }
    for child in expr.children() {
        if let Some(found) = duplicate_id(child, seen) {
            return Some(found);
        }
    }
    None
}
