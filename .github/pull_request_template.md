## Qué cambia

<!-- Una idea por pull request. Enlaza la issue si existe: Closes #123 -->

## Cómo se probó

<!-- Tests nuevos o casos a mano. Si toca el bench, la pasada y sus números. -->

## Checklist

- [ ] `pnpm typecheck` y `pnpm test` pasan
- [ ] Si toca el parser, el checker, el printer, las operaciones o el binario, el cambio está también en `rust/` y `cargo test --manifest-path rust/Cargo.toml` pasa
- [ ] Si cambia el alcance o el estado de una pieza, `ROADMAP.md` está actualizado
- [ ] El diff no incluye `.env`, claves ni salidas de un modelo con datos personales
