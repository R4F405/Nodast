# Contributing to Nodast

Thanks for your interest. Nodast is small, so one pull request can move it a lot. Issues, pull requests and reviews can be in **English or Spanish**. [Leer en español](CONTRIBUTING.es.md).

The proof of concept is done: parser, checker, TypeScript printer, id edits, model contract, binary format, Rust engine, tools and benchmark. A change gets in when it moves the [roadmap](ROADMAP.md) forward and respects the [design decisions](README.md#how-it-works) in the README.

## Your first contribution

1. **Pick something small.** Take an issue labeled [good first issue](https://github.com/R4F405/Nodast/labels/good%20first%20issue), or one of the [ideas below](#ideas-for-a-first-pull-request). Comment on the issue to say you are on it, so nobody does it twice. For an idea from the list with no issue yet, open one first if it is marked *needs an issue*.
2. **Set up** (about a minute):

   ```sh
   git clone https://github.com/<you>/Nodast.git   # your fork
   cd Nodast
   pnpm install
   pnpm test && pnpm typecheck
   ```

   You need Node.js 22.18 or newer and [pnpm](https://pnpm.io); the version is pinned in `packageManager`. Stable Rust is only needed if you touch `rust/`.
3. **Find your way around.** `node src/demo.ts` and the two files in [`examples/`](examples/) show the whole loop in a few lines. Then:

   | Path | What lives there |
   | --- | --- |
   | `src/ir.ts` | The node types: the whole language in one union |
   | `src/parse.ts`, `src/print.ts` | Compact text to tree, tree to TypeScript |
   | `src/check.ts` | Scopes and Hindley-Milner type inference |
   | `src/edit.ts`, `src/contract.ts` | `(edits ...)`, and the loop with the model and its retries |
   | `src/tools.ts` | `find`, `show`, `edit`, with `rename` and `param` |
   | `src/binary.ts`, `src/grammar.ts` | Flat binary format; character-level grammar check |
   | `rust/` | The same engine in Rust |
   | `bench/` | The benchmark against plain text and a text agent |
   | `test/` | `node:test` suites; no network, no key |

4. **Make the change with a test that pins it.** A new behavior comes with a case in `test/`. If it changes the parser, the checker, the printer, the edits or the binary format, it lands in `src/` and `rust/` together.
5. **Run the checks** that CI runs:

   ```sh
   pnpm typecheck
   pnpm test
   cargo test --manifest-path rust/Cargo.toml   # if you touched rust/
   ```

6. **Open the pull request** against `main` and fill in the template. The title follows [Conventional Commits](https://www.conventionalcommits.org/), for example `fix: accept index -1 in edit`, because pull requests are squash-merged and the title becomes the commit.

Stuck? Ask on the issue or in [Discussions](https://github.com/R4F405/Nodast/discussions). A draft pull request with a question is welcome too.

## Ideas for a first pull request

These are not issues yet. If you want one, open an issue with the idea (or just the pull request, when it says so) and mention this list.

- **`pnpm ask` without a `.env` file.** Today Node stops with `.env: not found`. Use `--env-file-if-exists` in `package.json` and print a hint about `.env.example` when the key is missing. *Pull request directly.*
- **Round-trip tests.** For a set of programs, check that `parse(compact(tree))` gives the same tree and that `decode(encode(tree))` does too, including generated deep trees. *Pull request directly.*
- **An example of the tool session.** `examples/tools.ts` that opens a program, calls `find` and `show`, and makes one `edit`, with the output explained in comments. Add it to `test/examples.test.ts`. *Pull request directly.*
- **Translate `ROADMAP.md` to English** as `ROADMAP.en.md`, and link it from the README. *Pull request directly.*
- **A tiny CLI.** `node src/cli.ts print file.nds` prints the TypeScript of a compact-text file, or the checker error with a non-zero exit code. *Needs an issue.*
- **`pnpm ask` with OpenAI.** Let `ask` pick the provider the way the benchmark does, with `BENCH_PROVIDER` or its own variable. *Needs an issue.*
- **Port `src/grammar.ts` to Rust**, with the same cases as `test/grammar.test.ts`. *Needs an issue.*
- **Boolean operators** `and`, `or` and `not`, across parser, checker, printer, edits, binary and Rust. A language change, so *needs an issue* first.

## Before writing code

Open an issue first if the change:

- adds a node kind
- changes the compact text, the edits or the checker's errors
- adds an output language
- moves work from a future phase into the current one

A documentation fix, a test for behavior that is already described, or a clear bug can go straight to a pull request.

## What is welcome now

- Fixes and tests for the described behavior.
- Structural operations in `src/tools.ts`, like `rename` and `param`, with their case in the benchmark.
- Growing the language toward real programs, after an issue that agrees on it.
- New measurements in `bench/`, with another model or another task.

One idea per pull request, one that can be tested on its own. TypeScript stays the behavior reference.

## What is not accepted

- Reopening JSON, hexadecimal or another compiler's AST as the format the model reads and writes.
- Having the model emit the final source.
- Another printer while the TypeScript one has not been stable for a while.
- Dependencies that only serve a future phase.
- Tests that call a paid API or need a key.

If you think a design decision is wrong, the issue has to say what breaks with the current decision and how the fix would be measured. The pull request waits for that conversation.

## Issues

Use a concrete title. In the body:

1. Which part of the roadmap it touches.
2. What behavior you want to be able to show.
3. What stays out of the change.

One language per issue, English or Spanish.

## Pull requests

`main` is protected: everything goes through a pull request and CI has to pass (TypeScript and Rust). Fork or branch, open the pull request against `main` and fill in the template.

- One idea per pull request.
- Link the issue when there is one.
- If the scope changes, update `ROADMAP.md` in the same pull request.
- Say how it was tested. If there are no automated tests yet, write the cases by hand.
- The diff does not include `.env`, keys, or real model output with personal data.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), in the imperative:

```text
feat: parse let and add into nodes
fix: reject a free variable in the checker
docs: mark the parser phase as in progress
```

The subject can be in English. If a body is needed, English or Spanish, the same language for the whole message.

## Style

- Strict TypeScript.
- 2-space indentation, UTF-8, LF, final newline. It is in `.editorconfig`.
- Names that say the node or the phase: `parse`, `check`, `print`, `apply`.
- The printer does not decide validity. If a tree is illegal, the failure comes from the parser or the checker.
- A model fixture is a file in the repo, not a network call.

## Benchmark

`pnpm bench` calls a real model and needs a key in `.env`; see `.env.example`. Neither the tests nor CI use one. It writes the full report to `bench/openai.md` or `bench/minimax.md` and rebuilds the tables in `BENCH.md`; `pnpm bench:summary` rebuilds them without calling the model.

## Conduct and security

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report a security problem privately, as described in [SECURITY.md](SECURITY.md), not in a public issue.

## License

By sending a pull request you agree to license your contribution under the [MIT License](LICENSE).
