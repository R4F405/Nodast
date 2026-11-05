# Contribuir

El PoC está cerrado: parser, checker, printer a TypeScript, operaciones, contrato con el modelo, binario, motor en Rust, tools y bench. Un cambio entra si acerca el [roadmap](ROADMAP.md) y respeta las decisiones cerradas del [README](README.md). Lo que más ayuda ahora está en "Después del PoC" del roadmap y en las issues.

## Antes de escribir código

Abre una issue si el cambio hace alguna de estas cosas:

- añade un tipo de nodo
- cambia el texto compacto, las operaciones o el error del checker
- suma un lenguaje de salida
- mueve trabajo de una fase futura a la fase actual

Un arreglo de documentación, un test del comportamiento ya descrito o un bug claro pueden ir directo en pull request.

## Qué se acepta ahora

- Arreglos y tests del comportamiento ya descrito.
- Operaciones de estructura en `src/tools.ts`, como `rename` y `param`, con su caso en el bench.
- Crecer el lenguaje hacia programas reales, tras una issue que lo acuerde.
- Mediciones nuevas en `bench/`, con otro modelo o con otra tarea.

En un pull request cabe una idea que se pueda probar sola. TypeScript sigue siendo la referencia de comportamiento: un cambio en el parser, el checker, el printer, las operaciones o el binario llega a la vez en `src/` y en `rust/`.

## Qué no se acepta

- Reabrir JSON, hexadecimal o el AST de otro compilador como formato hacia el modelo.
- Hacer que el modelo emita el fuente final.
- Añadir otro printer mientras el de TypeScript no lleve un tiempo estable.
- Dependencias que solo sirven para una fase futura.
- Tests que llamen a una API de pago o exijan una clave.

Si crees que una decisión cerrada está mal, la issue tiene que decir qué se rompe con la decisión actual y cómo se mediría el arreglo. El pull request espera a esa conversación.

## Issues

Usa un título concreto. En el cuerpo:

1. Qué fase del roadmap toca.
2. Qué comportamiento se quiere poder demostrar.
3. Qué queda fuera de ese cambio.

El idioma puede ser español o inglés. Uno solo por issue.

## Pull requests

`main` está protegida: todo entra por pull request y la CI tiene que pasar (TypeScript y Rust). Haz un fork o una rama, abre el pull request contra `main` y rellena la plantilla. Se fusiona con squash, así que el título del pull request queda como commit y sigue Conventional Commits.

- Una idea por pull request.
- El cuerpo enlaza la issue cuando exista.
- Si cambia el alcance, actualiza `ROADMAP.md` en el mismo pull request.
- Describe cómo se probó. Si todavía no hay tests automáticos, escribe los casos a mano.
- El diff no incluye `.env`, claves ni salidas de un modelo real con datos personales.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), en imperativo:

```text
feat: parse let and add into nodes
fix: reject a free variable in the checker
docs: mark the parser phase as in progress
```

El asunto puede ir en inglés. Si el cuerpo hace falta, español o inglés, el mismo idioma en todo el mensaje.

## Estilo

- TypeScript estricto.
- Indentación de 2 espacios, UTF-8, LF, nueva línea final. Está en `.editorconfig`.
- Nombres que digan el nodo o la fase: `parse`, `check`, `print`, `apply`.
- El printer no decide validez. Si el árbol es ilegal, el fallo sale del parser o del checker.
- Un comportamiento nuevo llega con un caso que lo fije. Un fixture del modelo es un archivo en el repo, no una llamada de red.

## Entorno

- Node 22.18 o superior
- pnpm 11.5, la versión del campo `packageManager` en `package.json`
- Rust estable, para `rust/`
- Un editor que respete `.editorconfig`

```sh
pnpm install
pnpm test
pnpm typecheck
cargo test --manifest-path rust/Cargo.toml
```

`pnpm bench` llama a un modelo de verdad y necesita una clave en `.env`; mira `.env.example`. Ni los tests ni la CI la usan.

## Licencia

Con tu pull request aceptas licenciar tu contribución bajo [MIT](LICENSE).
