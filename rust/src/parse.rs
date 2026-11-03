use crate::ir::{BinOp, Expr, SourcePosition};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParseError {
    pub message: String,
    pub position: SourcePosition,
}

const RESERVED: &[&str] = &[
    "let", "fn", "if", "add", "sub", "mul", "div", "eq", "lt", "gt", "lte", "gte", "true", "false",
];

struct Parser {
    source: Vec<char>,
    index: usize,
    line: usize,
    column: usize,
    next_id: usize,
}

impl Parser {
    fn new(source: &str) -> Self {
        Self { source: source.chars().collect(), index: 0, line: 1, column: 1, next_id: 1 }
    }

    fn parse_program(&mut self) -> Result<Expr, ParseError> {
        self.skip_ws();
        if self.peek().is_none() {
            return self.fail("Expected an expression", self.position());
        }
        let tree = self.parse_expr()?;
        self.skip_ws();
        if self.peek().is_some() {
            return self.fail("Unexpected trailing input", self.position());
        }
        Ok(tree)
    }

    fn parse_expr(&mut self) -> Result<Expr, ParseError> {
        self.skip_ws();
        let start = self.position();
        let Some(char) = self.peek() else {
            return self.fail("Expected an expression", start);
        };
        if char == '(' {
            return self.parse_list();
        }
        if char == '-' || is_digit(char) {
            return self.parse_number();
        }
        if is_name_start(char) {
            return self.parse_name_expr();
        }
        self.fail(format!("Unexpected character '{char}'"), start)
    }

    fn parse_list(&mut self) -> Result<Expr, ParseError> {
        let open = self.position();
        self.bump('(');
        self.skip_ws();
        if self.peek().is_none() {
            return self.fail("Unclosed '('", open);
        }
        if self.peek() == Some(')') {
            return self.fail("Expected an expression", self.position());
        }
        if self.peek().is_some_and(is_name_start) {
            let head_pos = self.position();
            let head = self.read_name()?;
            if head == "let" {
                return self.parse_let(open, head_pos);
            }
            if head == "fn" {
                return self.parse_fn(open, head_pos);
            }
            if head == "if" {
                return self.parse_if(open, head_pos);
            }
            if let Some(op) = bin_op(&head) {
                return self.parse_binary(open, head_pos, op, &head);
            }
            let call_id = self.alloc();
            let callee = self.name_node(head, head_pos)?;
            return self.finish_call(open, call_id, callee);
        }
        let call_id = self.alloc();
        let callee = self.parse_expr()?;
        self.finish_call(open, call_id, callee)
    }

    fn parse_let(&mut self, open: SourcePosition, head_pos: SourcePosition) -> Result<Expr, ParseError> {
        let id = self.alloc();
        self.skip_ws();
        if !self.peek().is_some_and(is_name_start) {
            if self.peek().is_none() {
                return self.fail("Unclosed '('", open);
            }
            return self.fail("Expected a name", self.position());
        }
        let name_pos = self.position();
        let name = self.read_name()?;
        if is_reserved(&name) {
            return self.fail(format!("{name} is a reserved word"), name_pos);
        }
        let args = self.parse_args(open)?;
        if args.len() != 2 {
            return self.fail(format!("let expects 3 arguments, got {}", args.len() + 1), head_pos);
        }
        let mut args = args;
        let body = args.pop().unwrap();
        let value = args.pop().unwrap();
        Ok(Expr::Let { id, name, value: Box::new(value), body: Box::new(body) })
    }

    fn parse_fn(&mut self, open: SourcePosition, head_pos: SourcePosition) -> Result<Expr, ParseError> {
        let id = self.alloc();
        self.skip_ws();
        if self.peek() != Some('(') {
            if self.peek().is_none() {
                return self.fail("Unclosed '('", open);
            }
            return self.fail("Expected a parameter list", self.position());
        }
        let params_open = self.position();
        self.bump('(');
        let mut params = Vec::new();
        let mut seen = Vec::new();
        loop {
            self.skip_ws();
            if self.peek() == Some(')') {
                self.bump(')');
                break;
            }
            if self.peek().is_none() {
                return self.fail("Unclosed '('", params_open);
            }
            if !self.peek().is_some_and(is_name_start) {
                return self.fail("Expected a name", self.position());
            }
            let name_pos = self.position();
            let name = self.read_name()?;
            if is_reserved(&name) {
                return self.fail(format!("{name} is a reserved word"), name_pos);
            }
            if seen.iter().any(|found: &String| found == &name) {
                return self.fail(format!("Duplicate parameter {name}"), name_pos);
            }
            seen.push(name.clone());
            params.push(name);
        }
        let args = self.parse_args(open)?;
        if args.len() != 1 {
            return self.fail(format!("fn expects 2 arguments, got {}", args.len() + 1), head_pos);
        }
        Ok(Expr::Fn { id, params, body: Box::new(args.into_iter().next().unwrap()) })
    }

    fn parse_if(&mut self, open: SourcePosition, head_pos: SourcePosition) -> Result<Expr, ParseError> {
        let id = self.alloc();
        let args = self.parse_args(open)?;
        if args.len() != 3 {
            return self.fail(format!("if expects 3 arguments, got {}", args.len()), head_pos);
        }
        let mut args = args;
        let else_branch = args.pop().unwrap();
        let then_branch = args.pop().unwrap();
        let cond = args.pop().unwrap();
        Ok(Expr::If {
            id,
            cond: Box::new(cond),
            then_branch: Box::new(then_branch),
            else_branch: Box::new(else_branch),
        })
    }

    fn parse_binary(
        &mut self,
        open: SourcePosition,
        head_pos: SourcePosition,
        op: BinOp,
        name: &str,
    ) -> Result<Expr, ParseError> {
        let id = self.alloc();
        let args = self.parse_args(open)?;
        if args.len() != 2 {
            return self.fail(format!("{name} expects 2 arguments, got {}", args.len()), head_pos);
        }
        let mut args = args;
        let right = args.pop().unwrap();
        let left = args.pop().unwrap();
        Ok(Expr::Bin { id, op, left: Box::new(left), right: Box::new(right) })
    }

    fn finish_call(&mut self, open: SourcePosition, id: String, callee: Expr) -> Result<Expr, ParseError> {
        let args = self.parse_args(open)?;
        Ok(Expr::Call { id, callee: Box::new(callee), args })
    }

    fn parse_args(&mut self, open: SourcePosition) -> Result<Vec<Expr>, ParseError> {
        let mut args = Vec::new();
        loop {
            self.skip_ws();
            if self.peek() == Some(')') {
                self.bump(')');
                return Ok(args);
            }
            if self.peek().is_none() {
                return self.fail("Unclosed '('", open);
            }
            args.push(self.parse_expr()?);
        }
    }

    fn parse_name_expr(&mut self) -> Result<Expr, ParseError> {
        let pos = self.position();
        let name = self.read_name()?;
        self.name_node(name, pos)
    }

    fn name_node(&mut self, name: String, pos: SourcePosition) -> Result<Expr, ParseError> {
        if name == "true" {
            return Ok(Expr::Bool { id: self.alloc(), value: true });
        }
        if name == "false" {
            return Ok(Expr::Bool { id: self.alloc(), value: false });
        }
        if is_reserved(&name) {
            return self.fail(format!("{name} is a reserved word"), pos);
        }
        Ok(Expr::Var { id: self.alloc(), name })
    }

    fn parse_number(&mut self) -> Result<Expr, ParseError> {
        let start = self.position();
        let mut negative = false;
        if self.peek() == Some('-') {
            let next = self.source.get(self.index + 1).copied();
            if !next.is_some_and(is_digit) {
                return self.fail("Unexpected character '-'", start);
            }
            negative = true;
            self.bump('-');
        }
        if !self.peek().is_some_and(is_digit) {
            return self.fail("Expected an expression", start);
        }
        if self.peek() == Some('0') {
            self.bump('0');
            if self.peek().is_some_and(is_digit) {
                return self.fail("Leading zeros are not allowed", start);
            }
            return Ok(Expr::Num { id: self.alloc(), value: 0.0 });
        }
        let mut magnitude = 0.0;
        while self.peek().is_some_and(is_digit) {
            let digit = self.peek().unwrap();
            magnitude = magnitude * 10.0 + digit.to_digit(10).unwrap() as f64;
            self.bump(digit);
        }
        Ok(Expr::Num { id: self.alloc(), value: if negative { -magnitude } else { magnitude } })
    }

    fn read_name(&mut self) -> Result<String, ParseError> {
        let start = self.position();
        if !self.peek().is_some_and(is_name_start) {
            return self.fail("Expected a name", start);
        }
        let mut name = String::new();
        while self.peek().is_some_and(is_name_char) {
            let char = self.peek().unwrap();
            name.push(char);
            self.bump(char);
        }
        Ok(name)
    }

    fn skip_ws(&mut self) {
        loop {
            match self.peek() {
                Some(' ' | '\t' | '\n') => self.bump(self.peek().unwrap()),
                Some('\r') => {
                    self.index += 1;
                    if self.peek() == Some('\n') {
                        self.index += 1;
                    }
                    self.line += 1;
                    self.column = 1;
                }
                _ => return,
            }
        }
    }

    fn alloc(&mut self) -> String {
        let id = format!("n{}", self.next_id);
        self.next_id += 1;
        id
    }

    fn peek(&self) -> Option<char> {
        self.source.get(self.index).copied()
    }

    fn bump(&mut self, char: char) {
        self.index += 1;
        if char == '\n' {
            self.line += 1;
            self.column = 1;
        } else {
            self.column += 1;
        }
    }

    fn position(&self) -> SourcePosition {
        SourcePosition { offset: self.index, line: self.line, column: self.column }
    }

    fn fail<T>(&self, message: impl Into<String>, position: SourcePosition) -> Result<T, ParseError> {
        Err(ParseError { message: message.into(), position })
    }
}

fn is_reserved(name: &str) -> bool {
    RESERVED.contains(&name)
}

fn bin_op(name: &str) -> Option<BinOp> {
    Some(match name {
        "add" => BinOp::Add,
        "sub" => BinOp::Sub,
        "mul" => BinOp::Mul,
        "div" => BinOp::Div,
        "eq" => BinOp::Eq,
        "lt" => BinOp::Lt,
        "gt" => BinOp::Gt,
        "lte" => BinOp::Lte,
        "gte" => BinOp::Gte,
        _ => return None,
    })
}

fn is_digit(char: char) -> bool {
    char.is_ascii_digit()
}

fn is_name_start(char: char) -> bool {
    char.is_ascii_alphabetic() || char == '_'
}

fn is_name_char(char: char) -> bool {
    is_name_start(char) || is_digit(char)
}

pub fn parse(source: &str) -> Result<Expr, ParseError> {
    Parser::new(source).parse_program()
}
