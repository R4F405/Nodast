use crate::ir::{BinOp, Expr};

#[derive(Clone, Debug, PartialEq)]
pub enum BinaryError {
    Truncated,
    BadMagic,
    BadVersion { version: u8 },
    UnknownKind { kind: u8 },
    BadString,
    Trailing,
}

const MAGIC: [u8; 4] = [0x4e, 0x44, 0x53, 0x31];
const VERSION: u8 = 1;

struct Writer {
    bytes: Vec<u8>,
}

impl Writer {
    fn u8(&mut self, value: u8) {
        self.bytes.push(value);
    }

    fn u32(&mut self, value: u32) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn f64(&mut self, value: f64) {
        self.bytes.extend_from_slice(&value.to_le_bytes());
    }
}

struct Reader<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> Reader<'a> {
    fn u8(&mut self) -> Result<u8, BinaryError> {
        let value = *self.bytes.get(self.offset).ok_or(BinaryError::Truncated)?;
        self.offset += 1;
        Ok(value)
    }

    fn u32(&mut self) -> Result<u32, BinaryError> {
        if self.offset + 4 > self.bytes.len() {
            return Err(BinaryError::Truncated);
        }
        let value = u32::from_le_bytes(self.bytes[self.offset..self.offset + 4].try_into().unwrap());
        self.offset += 4;
        Ok(value)
    }

    fn f64(&mut self) -> Result<f64, BinaryError> {
        if self.offset + 8 > self.bytes.len() {
            return Err(BinaryError::Truncated);
        }
        let value = f64::from_le_bytes(self.bytes[self.offset..self.offset + 8].try_into().unwrap());
        self.offset += 8;
        Ok(value)
    }

    fn raw(&mut self, length: usize) -> Result<&'a [u8], BinaryError> {
        if self.offset + length > self.bytes.len() {
            return Err(BinaryError::Truncated);
        }
        let slice = &self.bytes[self.offset..self.offset + length];
        self.offset += length;
        Ok(slice)
    }

    fn done(&self) -> bool {
        self.offset == self.bytes.len()
    }
}

pub fn encode(expr: &Expr) -> Vec<u8> {
    let mut strings = Vec::new();
    let mut index = std::collections::HashMap::new();
    collect(expr, &mut strings, &mut index);
    let mut writer = Writer { bytes: Vec::new() };
    for byte in MAGIC {
        writer.u8(byte);
    }
    writer.u8(VERSION);
    writer.u32(strings.len() as u32);
    for value in &strings {
        let raw = value.as_bytes();
        writer.u32(raw.len() as u32);
        writer.bytes.extend_from_slice(raw);
    }
    writer.u32(count_nodes(expr) as u32);
    write_node(expr, &mut writer, &index);
    writer.bytes
}

pub fn decode(bytes: &[u8]) -> Result<Expr, BinaryError> {
    let mut reader = Reader { bytes, offset: 0 };
    let magic = [reader.u8()?, reader.u8()?, reader.u8()?, reader.u8()?];
    if magic != MAGIC {
        return Err(BinaryError::BadMagic);
    }
    let version = reader.u8()?;
    if version != VERSION {
        return Err(BinaryError::BadVersion { version });
    }
    let string_count = reader.u32()? as usize;
    let mut strings = Vec::new();
    for _ in 0..string_count {
        let length = reader.u32()? as usize;
        let raw = reader.raw(length)?;
        let text = std::str::from_utf8(raw).map_err(|_| BinaryError::BadString)?;
        strings.push(text.to_string());
    }
    let node_count = reader.u32()? as usize;
    let mut seen = 0;
    let tree = read_node(&mut reader, &strings, &mut seen, node_count)?;
    if seen != node_count {
        return Err(BinaryError::Truncated);
    }
    if !reader.done() {
        return Err(BinaryError::Trailing);
    }
    Ok(tree)
}

fn read_node(reader: &mut Reader<'_>, strings: &[String], seen: &mut usize, node_count: usize) -> Result<Expr, BinaryError> {
    if *seen >= node_count {
        return Err(BinaryError::Truncated);
    }
    *seen += 1;
    let kind = reader.u8()?;
    let id = string_at(strings, reader.u32()? as usize)?;
    match kind {
        0 => Ok(Expr::Num { id, value: reader.f64()? }),
        1 => Ok(Expr::Bool { id, value: reader.u8()? != 0 }),
        2 => Ok(Expr::Var { id, name: string_at(strings, reader.u32()? as usize)? }),
        3..=11 => {
            let op = bin_op(kind)?;
            let left = read_node(reader, strings, seen, node_count)?;
            let right = read_node(reader, strings, seen, node_count)?;
            Ok(Expr::Bin { id, op, left: Box::new(left), right: Box::new(right) })
        }
        12 => {
            let name = string_at(strings, reader.u32()? as usize)?;
            let value = read_node(reader, strings, seen, node_count)?;
            let body = read_node(reader, strings, seen, node_count)?;
            Ok(Expr::Let { id, name, value: Box::new(value), body: Box::new(body) })
        }
        13 => {
            let count = reader.u32()? as usize;
            let mut params = Vec::new();
            for _ in 0..count {
                params.push(string_at(strings, reader.u32()? as usize)?);
            }
            let body = read_node(reader, strings, seen, node_count)?;
            Ok(Expr::Fn { id, params, body: Box::new(body) })
        }
        14 => {
            let count = reader.u32()? as usize;
            let callee = read_node(reader, strings, seen, node_count)?;
            let mut args = Vec::new();
            for _ in 0..count {
                args.push(read_node(reader, strings, seen, node_count)?);
            }
            Ok(Expr::Call { id, callee: Box::new(callee), args })
        }
        15 => {
            let cond = read_node(reader, strings, seen, node_count)?;
            let then_branch = read_node(reader, strings, seen, node_count)?;
            let else_branch = read_node(reader, strings, seen, node_count)?;
            Ok(Expr::If {
                id,
                cond: Box::new(cond),
                then_branch: Box::new(then_branch),
                else_branch: Box::new(else_branch),
            })
        }
        kind => Err(BinaryError::UnknownKind { kind }),
    }
}

fn bin_op(kind: u8) -> Result<BinOp, BinaryError> {
    Ok(match kind {
        3 => BinOp::Add,
        4 => BinOp::Sub,
        5 => BinOp::Mul,
        6 => BinOp::Div,
        7 => BinOp::Eq,
        8 => BinOp::Lt,
        9 => BinOp::Gt,
        10 => BinOp::Lte,
        11 => BinOp::Gte,
        kind => return Err(BinaryError::UnknownKind { kind }),
    })
}

fn string_at(strings: &[String], index: usize) -> Result<String, BinaryError> {
    strings.get(index).cloned().ok_or(BinaryError::BadString)
}

fn collect(expr: &Expr, strings: &mut Vec<String>, index: &mut std::collections::HashMap<String, u32>) {
    intern(strings, index, expr.id());
    match expr {
        Expr::Num { .. } | Expr::Bool { .. } => {}
        Expr::Var { name, .. } => intern(strings, index, name),
        Expr::Bin { left, right, .. } => {
            collect(left, strings, index);
            collect(right, strings, index);
        }
        Expr::Let { name, value, body, .. } => {
            intern(strings, index, name);
            collect(value, strings, index);
            collect(body, strings, index);
        }
        Expr::Fn { params, body, .. } => {
            for param in params {
                intern(strings, index, param);
            }
            collect(body, strings, index);
        }
        Expr::Call { callee, args, .. } => {
            collect(callee, strings, index);
            for arg in args {
                collect(arg, strings, index);
            }
        }
        Expr::If { cond, then_branch, else_branch, .. } => {
            collect(cond, strings, index);
            collect(then_branch, strings, index);
            collect(else_branch, strings, index);
        }
    }
}

fn write_node(expr: &Expr, writer: &mut Writer, index: &std::collections::HashMap<String, u32>) {
    writer.u8(kind_code(expr));
    writer.u32(index[expr.id()]);
    match expr {
        Expr::Num { value, .. } => writer.f64(*value),
        Expr::Bool { value, .. } => writer.u8(if *value { 1 } else { 0 }),
        Expr::Var { name, .. } => writer.u32(index[name]),
        Expr::Bin { left, right, .. } => {
            write_node(left, writer, index);
            write_node(right, writer, index);
        }
        Expr::Let { name, value, body, .. } => {
            writer.u32(index[name]);
            write_node(value, writer, index);
            write_node(body, writer, index);
        }
        Expr::Fn { params, body, .. } => {
            writer.u32(params.len() as u32);
            for param in params {
                writer.u32(index[param]);
            }
            write_node(body, writer, index);
        }
        Expr::Call { callee, args, .. } => {
            writer.u32(args.len() as u32);
            write_node(callee, writer, index);
            for arg in args {
                write_node(arg, writer, index);
            }
        }
        Expr::If { cond, then_branch, else_branch, .. } => {
            write_node(cond, writer, index);
            write_node(then_branch, writer, index);
            write_node(else_branch, writer, index);
        }
    }
}

fn kind_code(expr: &Expr) -> u8 {
    match expr {
        Expr::Num { .. } => 0,
        Expr::Bool { .. } => 1,
        Expr::Var { .. } => 2,
        Expr::Bin { op, .. } => match op {
            BinOp::Add => 3,
            BinOp::Sub => 4,
            BinOp::Mul => 5,
            BinOp::Div => 6,
            BinOp::Eq => 7,
            BinOp::Lt => 8,
            BinOp::Gt => 9,
            BinOp::Lte => 10,
            BinOp::Gte => 11,
        },
        Expr::Let { .. } => 12,
        Expr::Fn { .. } => 13,
        Expr::Call { .. } => 14,
        Expr::If { .. } => 15,
    }
}

fn count_nodes(expr: &Expr) -> usize {
    1 + expr.children().iter().map(|child| count_nodes(child)).sum::<usize>()
}

fn intern(strings: &mut Vec<String>, index: &mut std::collections::HashMap<String, u32>, value: &str) {
    if index.contains_key(value) {
        return;
    }
    index.insert(value.to_string(), strings.len() as u32);
    strings.push(value.to_string());
}
