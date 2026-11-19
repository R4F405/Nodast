## What changes / Qué cambia

<!-- One idea per pull request. Link the issue if there is one: Closes #123 -->
<!-- Una idea por pull request. Enlaza la issue si existe: Closes #123 -->

## How it was tested / Cómo se probó

<!-- New tests or cases by hand. If it touches the bench, the pass and its numbers. -->
<!-- Tests nuevos o casos a mano. Si toca el bench, la pasada y sus números. -->

## Checklist

- [ ] `pnpm typecheck` and `pnpm test` pass / pasan
- [ ] If it touches the parser, checker, printer, edits or binary format, the change is also in `rust/` and `cargo test --manifest-path rust/Cargo.toml` passes / Si toca el parser, el checker, el printer, las operaciones o el binario, el cambio está también en `rust/` y `cargo test` pasa
- [ ] If the scope or the state of a piece changes, `ROADMAP.md` is updated / Si cambia el alcance o el estado de una pieza, `ROADMAP.md` está actualizado
- [ ] The diff has no `.env`, keys or model output with personal data / El diff no incluye `.env`, claves ni salidas de un modelo con datos personales
