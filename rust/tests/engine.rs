use nodast::{
    apply_edits, check, decode, encode, parse, print, BinOp, CheckError, Edit, EditError, Expr, BinaryError,
};

fn tree(source: &str) -> Expr {
    parse(source).unwrap_or_else(|error| panic!("{} at {}:{}", error.message, error.position.line, error.position.column))
}

fn num(id: &str, value: f64) -> Expr {
    Expr::Num { id: id.to_string(), value }
}

#[test]
fn parses_and_prints_the_closed_language() {
    assert_eq!(
        tree("(add 1 2)"),
        Expr::Bin { id: "n1".into(), op: BinOp::Add, left: Box::new(num("n2", 1.0)), right: Box::new(num("n3", 2.0)) }
    );
    for (source, op) in [
        ("(sub 5 2)", BinOp::Sub),
        ("(mul 5 2)", BinOp::Mul),
        ("(div 5 2)", BinOp::Div),
        ("(eq 5 2)", BinOp::Eq),
        ("(lt 5 2)", BinOp::Lt),
        ("(gt 5 2)", BinOp::Gt),
        ("(lte 5 2)", BinOp::Lte),
        ("(gte 5 2)", BinOp::Gte),
    ] {
        let Expr::Bin { op: found, .. } = tree(source) else { panic!("{source}") };
        assert_eq!(found, op);
    }
    assert_eq!(tree("true"), Expr::Bool { id: "n1".into(), value: true });
    assert_eq!(tree("-3"), num("n1", -3.0));
    assert_eq!(tree("(f 1)"), Expr::Call {
        id: "n1".into(),
        callee: Box::new(Expr::Var { id: "n2".into(), name: "f".into() }),
        args: vec![num("n3", 1.0)],
    });
    assert_eq!(tree("(let x 1 x)"), tree("  (let x 1 x)  "));
    assert_eq!(print(&tree("(let x (add 1 2) x)")), "const x = 1 + 2;\nx;\n");
    assert_eq!(print(&tree("(let add1 (fn (x) (add x 1)) (add1 2))")), "const add1 = (x) => x + 1;\nadd1(2);\n");
    assert_eq!(print(&tree("(if (lt 1 2) (add 3 4) (mul 5 6))")), "1 < 2 ? 3 + 4 : 5 * 6;\n");
    assert_eq!(print(&tree("(fn (x y) (sub x y))")), "((x, y) => x - y);\n");
    assert_eq!(print(&tree("(add 1 (mul 2 3))")), "1 + 2 * 3;\n");
    assert_eq!(print(&tree("(mul (add 1 2) 3)")), "(1 + 2) * 3;\n");
    assert_eq!(print(&tree("(sub 1 (sub 2 3))")), "1 - (2 - 3);\n");
    assert_eq!(print(&tree("(eq (lt 1 2) true)")), "(1 < 2) === true;\n");
    assert_eq!(print(&tree("(add (if true 1 2) 3)")), "(true ? 1 : 2) + 3;\n");
    assert_eq!(
        print(&tree("(let x (let y 1 y) x)")),
        "const x = (() => {\n  const y = 1;\n  return y;\n})();\nx;\n"
    );
    assert_eq!(
        print(&tree("(fn (x) (let y (add x 1) y))")),
        "((x) => {\n  const y = x + 1;\n  return y;\n});\n"
    );
}

#[test]
fn rejects_bad_programs_at_the_same_place() {
    let cases = [
        ("", "Expected an expression", 1, 1),
        ("   ", "Expected an expression", 1, 4),
        ("(add 1 2) x", "Unexpected trailing input", 1, 11),
        ("(add 1 2", "Unclosed '('", 1, 1),
        ("(add 1)", "add expects 2 arguments, got 1", 1, 2),
        ("(if true 1)", "if expects 3 arguments, got 2", 1, 2),
        ("(let add 1 add)", "add is a reserved word", 1, 6),
        ("(fn (let) 1)", "let is a reserved word", 1, 6),
        ("(fn (x x) x)", "Duplicate parameter x", 1, 8),
        ("01", "Leading zeros are not allowed", 1, 1),
        ("^", "Unexpected character '^'", 1, 1),
    ];
    for (source, message, line, column) in cases {
        let error = parse(source).expect_err(source);
        assert_eq!(error.message, message, "{source}");
        assert_eq!((error.position.line, error.position.column), (line, column), "{source}");
    }
}

#[test]
fn checks_the_same_programs_as_the_typescript_reference() {
    assert_eq!(check(&tree("(let f (fn (x) (add x 1)) (f 2))")).unwrap(), "number");
    assert_eq!(check(&tree("(fn (x y) (lt x y))")).unwrap(), "(number, number) -> bool");
    assert_eq!(check(&tree("(fn () 1)")).unwrap(), "() -> number");
    assert_eq!(check(&tree("(let apply (fn (f) (f 1)) (apply (fn (x) (add x 1))))")).unwrap(), "number");
    assert_eq!(
        check(&tree("(add x 1)")).unwrap_err(),
        CheckError::UndefinedName { node_id: "n2".into(), name: "x".into() }
    );
    assert_eq!(
        check(&tree("(add true 1)")).unwrap_err(),
        CheckError::TypeMismatch { node_id: "n1".into(), expected: "number".into(), actual: "bool".into() }
    );
    assert_eq!(
        check(&tree("(let f (fn (x) 1) (f))")).unwrap_err(),
        CheckError::ArityMismatch { node_id: "n4".into(), expected: 1, actual: 0 }
    );
    assert_eq!(
        check(&tree("(let f 1 (f))")).unwrap_err(),
        CheckError::NotAFunction { node_id: "n3".into(), actual: "number".into() }
    );
    assert_eq!(
        check(&tree("(fn (x) (x x))")).unwrap_err(),
        CheckError::InfiniteType { node_id: "n2".into(), name: "x".into() }
    );
    assert_eq!(check(&tree("(fn (x) x)")).unwrap(), "(a) -> a");
    assert_eq!(check(&tree("(fn (x y) (eq x y))")).unwrap(), "(a, a) -> bool");
    assert_eq!(check(&tree("(fn (f) (f 5))")).unwrap(), "((number) -> a) -> a");
    assert_eq!(check(&tree("(fn (f x) (f (f x)))")).unwrap(), "((a) -> a, a) -> a");
    assert_eq!(check(&tree("(let id (fn (x) x) (if (id true) (id 1) 2))")).unwrap(), "number");
    assert_eq!(
        check(&tree("(let same (fn (x y) (eq x y)) (if (same true false) (same 1 2) false))")).unwrap(),
        "bool"
    );
    assert_eq!(
        check(&tree("(fn (f) (if (f true) (f 1) 2))")).unwrap_err(),
        CheckError::TypeMismatch { node_id: "n6".into(), expected: "bool".into(), actual: "number".into() }
    );
    assert_eq!(
        check(&tree("(let same (fn (x y) (eq x y)) (same (fn (a) a) (fn (b) b)))")).unwrap_err(),
        CheckError::TypeMismatch { node_id: "n6".into(), expected: "number | bool".into(), actual: "(a) -> a".into() }
    );
    let duplicated = Expr::Bin {
        id: "n1".into(),
        op: BinOp::Add,
        left: Box::new(num("n1", 1.0)),
        right: Box::new(num("n2", 2.0)),
    };
    assert_eq!(check(&duplicated).unwrap_err(), CheckError::DuplicateId { node_id: "n1".into() });
}

#[test]
fn edits_by_id_without_touching_the_input() {
    let input = tree("(add 1 2)");
    let snapshot = input.clone();
    let replaced = apply_edits(&input, &[Edit::Replace { id: "n2".into(), node: num("n2", 9.0) }]).unwrap();
    assert_eq!(print(&replaced), "9 + 2;\n");
    assert_eq!(input, snapshot);
    let inserted = apply_edits(&tree("(f 1)"), &[Edit::Insert { id: "n1".into(), index: 1, node: num("n4", 2.0) }]).unwrap();
    assert_eq!(print(&inserted), "f(1, 2);\n");
    let deleted = apply_edits(&tree("(f 1 2)"), &[Edit::Delete { id: "n3".into() }]).unwrap();
    assert_eq!(print(&deleted), "f(2);\n");
    let batched = apply_edits(
        &tree("(f 1)"),
        &[
            Edit::Insert { id: "n1".into(), index: 1, node: num("n4", 2.0) },
            Edit::Delete { id: "n3".into() },
        ],
    )
    .unwrap();
    assert_eq!(print(&batched), "f(2);\n");
    assert_eq!(
        apply_edits(&input, &[Edit::Delete { id: "n2".into() }]).unwrap_err(),
        EditError::CannotDelete { id: "n2".into(), at: 0 }
    );
    assert_eq!(
        apply_edits(&tree("(f 1)"), &[Edit::Insert { id: "n1".into(), index: 2, node: num("n9", 3.0) }]).unwrap_err(),
        EditError::IndexOutOfRange { id: "n1".into(), at: 0, index: 2, length: 1 }
    );
    assert_eq!(
        apply_edits(&input, &[
            Edit::Replace { id: "n2".into(), node: num("n9", 9.0) },
            Edit::Delete { id: "missing".into() },
        ])
        .unwrap_err(),
        EditError::UnknownId { id: "missing".into(), at: 1 }
    );
}

#[test]
fn roundtrips_the_flat_buffer() {
    let add = tree("(add 1 2)");
    let bytes = encode(&add);
    assert_eq!(
        bytes,
        vec![
            0x4e, 0x44, 0x53, 0x31, 0x01, 0x03, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x6e, 0x31, 0x02, 0x00,
            0x00, 0x00, 0x6e, 0x32, 0x02, 0x00, 0x00, 0x00, 0x6e, 0x33, 0x03, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf0, 0x3f, 0x00, 0x02,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40,
        ]
    );
    assert_eq!(decode(&bytes).unwrap(), add);
    assert_eq!(decode(&[0]).unwrap_err(), BinaryError::Truncated);
    assert_eq!(decode(&[0, 0, 0, 0]).unwrap_err(), BinaryError::BadMagic);
    let mut other = bytes.clone();
    other[4] = 2;
    assert_eq!(decode(&other).unwrap_err(), BinaryError::BadVersion { version: 2 });
    let mut unknown = bytes.clone();
    unknown[31] = 99;
    assert_eq!(decode(&unknown).unwrap_err(), BinaryError::UnknownKind { kind: 99 });
    for source in ["(let x (add 1 2) x)", "(fn (x y) (add x y))", "(fn () 1)", "(f)", "(if (lt x 0) 0 x)", "-3", "true"] {
        let parsed = tree(source);
        assert_eq!(decode(&encode(&parsed)).unwrap(), parsed);
    }
}

#[test]
fn gives_a_let_that_reuses_or_reads_its_own_name_a_fresh_scope() {
    let cases = [
        ("(let k 2 (let a (add k 1) (let k 3 (add a k))))", "const k = 2;\nconst a = k + 1;\n(() => {\n  const k = 3;\n  return a + k;\n})();\n"),
        ("(let k 2 (let k (add k 1) k))", "const k = 2;\n((k) => k)(k + 1);\n"),
        ("(let k 2 (add 1 (let k (add k 1) k)))", "const k = 2;\n1 + ((k) => k)(k + 1);\n"),
        ("(fn (x) (let x (add x 1) x))", "((x) => {\n  return ((x) => x)(x + 1);\n});\n"),
    ];
    for (source, want) in cases {
        assert_eq!(print(&tree(source)), want, "{source}");
    }
}
