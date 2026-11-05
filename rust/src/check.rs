use std::collections::{HashMap, HashSet};

use crate::ir::Expr;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CheckError {
    DuplicateId { node_id: String },
    UndefinedName { node_id: String, name: String },
    TypeMismatch { node_id: String, expected: String, actual: String },
    ArityMismatch { node_id: String, expected: usize, actual: usize },
    NotAFunction { node_id: String, actual: String },
    InfiniteType { node_id: String, name: String },
}

#[derive(Clone, Debug, PartialEq)]
enum Type {
    Number,
    Bool,
    Fn { params: Vec<Type>, ret: Box<Type> },
    Var { id: usize, name: String, node_id: String },
}

// A let-bound name is generic over vars: each use gets fresh copies of them, so (let id (fn (x) x) ...)
// can be used on numbers and on bools. Parameters and other names have no vars.
#[derive(Clone, Debug)]
struct Scheme {
    vars: HashSet<usize>,
    ty: Type,
}

type Env = HashMap<String, Scheme>;

fn mono(ty: Type) -> Scheme {
    Scheme { vars: HashSet::new(), ty }
}

struct Checker {
    next_var: usize,
    bound: HashMap<usize, Type>,
    primitive: HashSet<usize>,
}

impl Checker {
    fn assert_unique(&self, expr: &Expr, seen: &mut HashSet<String>) -> Result<(), CheckError> {
        if !seen.insert(expr.id().to_string()) {
            return Err(CheckError::DuplicateId { node_id: expr.id().to_string() });
        }
        for child in expr.children() {
            self.assert_unique(child, seen)?;
        }
        Ok(())
    }

    fn infer(&mut self, expr: &Expr, env: &Env) -> Result<Type, CheckError> {
        match expr {
            Expr::Num { .. } => Ok(Type::Number),
            Expr::Bool { .. } => Ok(Type::Bool),
            Expr::Var { id, name, .. } => {
                let scheme = env.get(name).cloned().ok_or_else(|| CheckError::UndefinedName {
                    node_id: id.clone(),
                    name: name.clone(),
                })?;
                Ok(self.instantiate(&scheme))
            }
            Expr::Bin { op, left, right, id } if op.name() == "lt" || op.name() == "gt" || op.name() == "lte" || op.name() == "gte" => {
                let left_ty = self.infer(left, env)?;
                let right_ty = self.infer(right, env)?;
                self.expect(&left_ty, &Type::Number, id)?;
                self.expect(&right_ty, &Type::Number, id)?;
                Ok(Type::Bool)
            }
            Expr::Bin { op, left, right, id } if matches!(op.name(), "add" | "sub" | "mul" | "div") => {
                let left_ty = self.infer(left, env)?;
                let right_ty = self.infer(right, env)?;
                self.expect(&left_ty, &Type::Number, id)?;
                self.expect(&right_ty, &Type::Number, id)?;
                Ok(Type::Number)
            }
            Expr::Bin { left, right, id, .. } => {
                let left_ty = self.infer(left, env)?;
                let right_ty = self.infer(right, env)?;
                self.unify(&left_ty, &right_ty, id)?;
                self.require_primitive(&left_ty, id)?;
                Ok(Type::Bool)
            }
            Expr::Let { name, value, body, .. } => {
                let value_ty = self.infer(value, env)?;
                let scheme = self.generalize(value_ty, env);
                let mut next = env.clone();
                next.insert(name.clone(), scheme);
                self.infer(body, &next)
            }
            Expr::Fn { id, params, body } => {
                let mut body_env = env.clone();
                let mut types = Vec::new();
                for name in params {
                    let param = self.fresh(name, id);
                    types.push(param.clone());
                    body_env.insert(name.clone(), mono(param));
                }
                let ret = self.infer(body, &body_env)?;
                Ok(Type::Fn { params: types, ret: Box::new(ret) })
            }
            Expr::Call { id, callee, args } => self.infer_call(id, callee, args, env),
            Expr::If { id, cond, then_branch, else_branch } => {
                let cond_ty = self.infer(cond, env)?;
                self.expect(&cond_ty, &Type::Bool, id)?;
                let then_ty = self.infer(then_branch, env)?;
                let else_ty = self.infer(else_branch, env)?;
                self.unify(&then_ty, &else_ty, id)?;
                Ok(then_ty)
            }
        }
    }

    fn infer_call(
        &mut self,
        id: &str,
        callee: &Expr,
        args: &[Expr],
        env: &Env,
    ) -> Result<Type, CheckError> {
        let inferred = self.infer(callee, env)?;
        let callee_ty = self.resolve(&inferred);
        let mut arg_types = Vec::new();
        for arg in args {
            arg_types.push(self.infer(arg, env)?);
        }
        match callee_ty {
            Type::Fn { params, ret } => {
                if params.len() != arg_types.len() {
                    return Err(CheckError::ArityMismatch {
                        node_id: id.to_string(),
                        expected: params.len(),
                        actual: arg_types.len(),
                    });
                }
                for (param, arg) in params.iter().zip(arg_types.iter()) {
                    self.unify(param, arg, id)?;
                }
                Ok(*ret)
            }
            Type::Var { .. } => {
                let ret = self.fresh("result", id);
                self.unify(&callee_ty, &Type::Fn { params: arg_types, ret: Box::new(ret.clone()) }, id)?;
                Ok(ret)
            }
            other => Err(CheckError::NotAFunction { node_id: id.to_string(), actual: self.show(&other) }),
        }
    }

    fn expect(&mut self, actual: &Type, expected: &Type, node_id: &str) -> Result<(), CheckError> {
        self.unify(expected, actual, node_id)
    }

    fn require_primitive(&mut self, ty: &Type, node_id: &str) -> Result<(), CheckError> {
        let root = self.resolve(ty);
        match root {
            Type::Number | Type::Bool => Ok(()),
            Type::Var { id, .. } => {
                self.primitive.insert(id);
                Ok(())
            }
            other => Err(CheckError::TypeMismatch {
                node_id: node_id.to_string(),
                expected: "number | bool".to_string(),
                actual: self.show(&other),
            }),
        }
    }

    fn unify(&mut self, left: &Type, right: &Type, node_id: &str) -> Result<(), CheckError> {
        let a = self.resolve(left);
        let b = self.resolve(right);
        if let (Type::Var { id: left_id, .. }, Type::Var { id: right_id, .. }) = (&a, &b) {
            if left_id == right_id {
                return Ok(());
            }
        }
        if matches!(a, Type::Var { .. }) {
            return self.bind(a, b, node_id);
        }
        if matches!(b, Type::Var { .. }) {
            return self.bind(b, a, node_id);
        }
        match (&a, &b) {
            (Type::Number, Type::Number) | (Type::Bool, Type::Bool) => Ok(()),
            (
                Type::Fn { params: left_params, ret: left_ret },
                Type::Fn { params: right_params, ret: right_ret },
            ) => {
                if left_params.len() != right_params.len() {
                    return Err(CheckError::ArityMismatch {
                        node_id: node_id.to_string(),
                        expected: left_params.len(),
                        actual: right_params.len(),
                    });
                }
                for (left_param, right_param) in left_params.iter().zip(right_params.iter()) {
                    self.unify(left_param, right_param, node_id)?;
                }
                self.unify(left_ret, right_ret, node_id)
            }
            _ => Err(CheckError::TypeMismatch {
                node_id: node_id.to_string(),
                expected: self.show(&a),
                actual: self.show(&b),
            }),
        }
    }

    fn bind(&mut self, variable: Type, ty: Type, node_id: &str) -> Result<(), CheckError> {
        let Type::Var { id: var_id, name, .. } = variable else { unreachable!() };
        if let Type::Var { id, .. } = &ty {
            if *id == var_id {
                return Ok(());
            }
        }
        if self.occurs(var_id, &ty) {
            return Err(CheckError::InfiniteType { node_id: node_id.to_string(), name });
        }
        let root = self.resolve(&ty);
        if self.primitive.contains(&var_id) {
            match &root {
                Type::Number | Type::Bool => {
                    self.primitive.remove(&var_id);
                }
                Type::Var { id, .. } => {
                    self.primitive.insert(*id);
                }
                other => {
                    return Err(CheckError::TypeMismatch {
                        node_id: node_id.to_string(),
                        expected: "number | bool".to_string(),
                        actual: self.show(other),
                    });
                }
            }
        }
        self.bound.insert(var_id, root);
        Ok(())
    }

    fn occurs(&mut self, var_id: usize, ty: &Type) -> bool {
        let root = self.resolve(ty);
        match root {
            Type::Var { id, .. } => id == var_id,
            Type::Fn { params, ret } => {
                for param in &params {
                    if self.occurs(var_id, param) {
                        return true;
                    }
                }
                self.occurs(var_id, &ret)
            }
            _ => false,
        }
    }

    fn resolve(&mut self, ty: &Type) -> Type {
        let Type::Var { id, .. } = ty else {
            return ty.clone();
        };
        let Some(next) = self.bound.get(id).cloned() else {
            return ty.clone();
        };
        let root = self.resolve(&next);
        if root != next {
            self.bound.insert(*id, root.clone());
        }
        root
    }

    fn fresh(&mut self, name: &str, node_id: &str) -> Type {
        let variable = Type::Var { id: self.next_var, name: name.to_string(), node_id: node_id.to_string() };
        self.next_var += 1;
        variable
    }

    fn show(&mut self, ty: &Type) -> String {
        self.show_named(ty, &mut Vec::new())
    }

    // Free vars print as a, b, c in order of first appearance, so (fn (f) (f 5)) is ((number) -> a) -> a.
    fn show_named(&mut self, ty: &Type, names: &mut Vec<usize>) -> String {
        let root = self.resolve(ty);
        match root {
            Type::Number => "number".to_string(),
            Type::Bool => "bool".to_string(),
            Type::Var { id, .. } => {
                let index = match names.iter().position(|seen| *seen == id) {
                    Some(index) => index,
                    None => {
                        names.push(id);
                        names.len() - 1
                    }
                };
                letter(index)
            }
            Type::Fn { params, ret } => {
                let mut shown = Vec::new();
                for param in params {
                    shown.push(self.show_named(&param, names));
                }
                format!("({}) -> {}", shown.join(", "), self.show_named(&ret, names))
            }
        }
    }

    fn generalize(&mut self, ty: Type, env: &Env) -> Scheme {
        let mut free = HashSet::new();
        self.free_vars(&ty, &mut free);
        if free.is_empty() {
            return mono(ty);
        }
        for scheme in env.values() {
            let mut inside = HashSet::new();
            self.free_vars(&scheme.ty, &mut inside);
            for id in inside {
                if !scheme.vars.contains(&id) {
                    free.remove(&id);
                }
            }
        }
        Scheme { vars: free, ty }
    }

    fn instantiate(&mut self, scheme: &Scheme) -> Type {
        if scheme.vars.is_empty() {
            return scheme.ty.clone();
        }
        let mut copies = HashMap::new();
        self.copy(&scheme.ty, &scheme.vars, &mut copies)
    }

    fn copy(&mut self, ty: &Type, vars: &HashSet<usize>, copies: &mut HashMap<usize, Type>) -> Type {
        let root = self.resolve(ty);
        match root {
            Type::Fn { params, ret } => {
                let params = params.iter().map(|param| self.copy(param, vars, copies)).collect();
                Type::Fn { params, ret: Box::new(self.copy(&ret, vars, copies)) }
            }
            Type::Var { id, ref name, ref node_id } if vars.contains(&id) => {
                if let Some(fresh) = copies.get(&id) {
                    return fresh.clone();
                }
                let fresh = self.fresh(name, node_id);
                if self.primitive.contains(&id) {
                    if let Type::Var { id: fresh_id, .. } = &fresh {
                        self.primitive.insert(*fresh_id);
                    }
                }
                copies.insert(id, fresh.clone());
                fresh
            }
            other => other,
        }
    }

    fn free_vars(&mut self, ty: &Type, into: &mut HashSet<usize>) {
        match self.resolve(ty) {
            Type::Var { id, .. } => {
                into.insert(id);
            }
            Type::Fn { params, ret } => {
                for param in &params {
                    self.free_vars(param, into);
                }
                self.free_vars(&ret, into);
            }
            _ => {}
        }
    }
}

fn letter(index: usize) -> String {
    let base = char::from(b'a' + (index % 26) as u8);
    if index < 26 {
        base.to_string()
    } else {
        format!("{base}{}", index / 26)
    }
}

pub fn check(expr: &Expr) -> Result<String, CheckError> {
    let mut checker = Checker { next_var: 0, bound: HashMap::new(), primitive: HashSet::new() };
    checker.assert_unique(expr, &mut HashSet::new())?;
    let ty = checker.infer(expr, &Env::new())?;
    Ok(checker.show(&ty))
}
