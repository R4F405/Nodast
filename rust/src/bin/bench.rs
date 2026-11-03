use std::env;
use std::fs;
use std::hint::black_box;
use std::process::ExitCode;
use std::time::Instant;

use nodast::{apply_edits, check, decode, encode, parse, print, Edit, Expr};

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("--edit") {
        return edit_bench();
    }
    if args.len() != 6 {
        return usage();
    }
    let Some(small_text) = args.first() else { return usage(); };
    let Some(large_text) = args.get(1) else { return usage(); };
    let Some(small_bin) = args.get(2) else { return usage(); };
    let Some(large_bin) = args.get(3) else { return usage(); };
    let Some(small_iters) = args.get(4).and_then(|value| value.parse::<u32>().ok()) else { return usage(); };
    let Some(large_iters) = args.get(5).and_then(|value| value.parse::<u32>().ok()) else { return usage(); };

    if report("small", &small_text, &small_bin, small_iters).is_err() {
        return ExitCode::from(1);
    }
    if report("large", &large_text, &large_bin, large_iters).is_err() {
        return ExitCode::from(1);
    }
    ExitCode::SUCCESS
}

fn edit_bench() -> ExitCode {
    let source = "(let x (add 1 2) x)";
    let tree = match parse(source) {
        Ok(tree) => tree,
        Err(error) => {
            eprintln!("{}", error.message);
            return ExitCode::from(1);
        }
    };
    let Some(id) = find_num(&tree, 1.0) else {
        eprintln!("missing literal");
        return ExitCode::from(1);
    };
    let edit = Edit::Replace { id: id.clone(), node: Expr::Num { id, value: 9.0 } };
    let once = match apply_edits(&tree, &[edit.clone()]) {
        Ok(tree) => tree,
        Err(_) => {
            eprintln!("edit failed");
            return ExitCode::from(1);
        }
    };
    let printed = print(&once);
    if printed != "const x = 9 + 2;\nx;\n" {
        eprintln!("unexpected print {printed}");
        return ExitCode::from(1);
    }
    let edit_ns = time(10_000, || apply_edits(&tree, &[edit.clone()]).map(|next| next.id().len() as u64).unwrap_or(0));
    println!("edit_ns {edit_ns}");
    ExitCode::SUCCESS
}

fn find_num(expr: &Expr, value: f64) -> Option<String> {
    if let Expr::Num { id, value: found } = expr {
        if *found == value {
            return Some(id.clone());
        }
    }
    for child in expr.children() {
        if let Some(id) = find_num(child, value) {
            return Some(id);
        }
    }
    None
}

fn usage() -> ExitCode {
    eprintln!("usage: bench <small.txt> <large.txt> <small.nds> <large.nds> <small-iters> <large-iters>");
    ExitCode::from(2)
}

fn report(name: &str, text_path: &str, bin_path: &str, iterations: u32) -> Result<(), String> {
    let text = fs::read_to_string(text_path).map_err(|error| error.to_string())?;
    let bytes = fs::read(bin_path).map_err(|error| error.to_string())?;
    let tree = parse(&text).map_err(|error| format!("{name} parse {}", error.message))?;
    let encoded = encode(&tree);
    if checksum(&encoded) != checksum(&bytes) {
        return Err(format!("{name} buffer does not match the TypeScript encoder"));
    }
    let decoded = decode(&bytes).map_err(|_| format!("{name} decode failed"))?;
    if checksum(&encode(&decoded)) != checksum(&bytes) {
        return Err(format!("{name} decode did not round-trip"));
    }
    let typed = check(&tree).map_err(|_| format!("{name} check failed"))?;
    let printed = print(&tree);
    let nodes = count(&tree);

    let parse_ns = time(iterations, || parse(&text).map(|tree| tree.id().len() as u64).unwrap_or(0));
    let decode_ns = time(iterations, || decode(&bytes).map(|tree| tree.id().len() as u64).unwrap_or(0));
    let check_ns = time(iterations, || check(&tree).map(|ty| ty.len() as u64).unwrap_or(0));
    let print_ns = time(iterations, || print(&tree).len() as u64);

    println!("{name} nodes {nodes}");
    println!("{name} text_bytes {}", text.len());
    println!("{name} buffer_bytes {}", bytes.len());
    println!("{name} type {typed}");
    println!("{name} print_bytes {}", printed.len());
    println!("{name} parse_ns {parse_ns}");
    println!("{name} decode_ns {decode_ns}");
    println!("{name} check_ns {check_ns}");
    println!("{name} print_ns {print_ns}");
    Ok(())
}

fn time(iterations: u32, mut work: impl FnMut() -> u64) -> u64 {
    let warmup = (iterations / 20).max(1);
    let mut sink = 0u64;
    for _ in 0..warmup {
        sink = sink.wrapping_add(black_box(work()));
    }
    let mut samples = Vec::with_capacity(iterations as usize);
    for _ in 0..iterations {
        let start = Instant::now();
        sink = sink.wrapping_add(black_box(work()));
        samples.push(start.elapsed().as_nanos() as u64);
    }
    black_box(sink);
    samples.sort_unstable();
    samples[samples.len() / 2]
}

fn count(expr: &nodast::Expr) -> usize {
    1 + expr.children().iter().map(|child| count(child)).sum::<usize>()
}

fn checksum(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in bytes {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}
