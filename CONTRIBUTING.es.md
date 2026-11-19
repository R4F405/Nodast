# Contribuir a Nodast

Gracias por el interés. Nodast es pequeño, así que un pull request puede moverlo mucho. Las issues, los pull requests y las revisiones pueden ir en **español o en inglés**. [Read in English](CONTRIBUTING.md).

El PoC está cerrado: parser, checker, printer a TypeScript, ediciones por id, contrato con el modelo, binario, motor en Rust, tools y medición. Un cambio entra si acerca el [roadmap](ROADMAP.md) y respeta las [decisiones de diseño](README.es.md#cómo-funciona) del README.

## Tu primera contribución

1. **Elige algo pequeño.** Coge una issue con la etiqueta [good first issue](https://github.com/R4F405/Nodast/labels/good%20first%20issue) o una de las [ideas de abajo](#ideas-para-un-primer-pull-request). Comenta en la issue que te pones con ella, para que nadie la haga dos veces. Si eliges una idea de la lista que aún no tiene issue y está marcada *necesita una issue*, ábrela antes.
2. **Prepara el entorno** (cosa de un minuto):

   ```sh
   git clone https://github.com/<tu-usuario>/Nodast.git   # tu fork
   cd Nodast
   pnpm install
   pnpm test && pnpm typecheck
   ```

   Hace falta Node.js 22.18 o superior y [pnpm](https://pnpm.io); la versión está fijada en `packageManager`. Rust estable solo hace falta si tocas `rust/`.
3. **Oriéntate.** `node src/demo.ts` y los dos archivos de [`examples/`](examples/) enseñan el círculo entero en pocas líneas. Después:

   | Ruta | Qué hay |
   | --- | --- |
   | `src/ir.ts` | Los tipos de nodo: todo el lenguaje en una unión |
   | `src/parse.ts`, `src/print.ts` | Texto compacto a árbol, árbol a TypeScript |
   | `src/check.ts` | Ámbitos e inferencia de tipos Hindley-Milner |
   | `src/edit.ts`, `src/contract.ts` | `(edits ...)`, y el bucle con el modelo y sus reintentos |
   | `src/tools.ts` | `find`, `show`, `edit`, con `rename` y `param` |
   | `src/binary.ts`, `src/grammar.ts` | Binario plano; gramática carácter a carácter |
   | `rust/` | El mismo motor en Rust |
   | `bench/` | La medición contra texto plano y un agente de texto |
   | `test/` | Suites de `node:test`; sin red y sin clave |

4. **Haz el cambio con un test que lo fije.** Un comportamiento nuevo llega con un caso en `test/`. Si cambia el parser, el checker, el printer, las operaciones o el binario, llega a la vez en `src/` y en `rust/`.
5. **Pasa las comprobaciones** de la CI:

   ```sh
   pnpm typecheck
   pnpm test
   cargo test --manifest-path rust/Cargo.toml   # si tocaste rust/
   ```

6. **Abre el pull request** contra `main` y rellena la plantilla. El título sigue [Conventional Commits](https://www.conventionalcommits.org/), por ejemplo `fix: accept index -1 in edit`, porque se fusiona con squash y el título queda como commit.

¿Atascado? Pregunta en la issue o en [Discussions](https://github.com/R4F405/Nodast/discussions). Un pull request en borrador con una pregunta también vale.

## Ideas para un primer pull request

Todavía no son issues. Si quieres una, abre una issue con la idea (o directamente el pull request, cuando lo diga) y menciona esta lista.

- **`pnpm ask` sin archivo `.env`.** Hoy Node se para con `.env: not found`. Usa `--env-file-if-exists` en `package.json` y enseña una pista sobre `.env.example` cuando falte la clave. *Pull request directo.*
- **Tests de ida y vuelta.** Para un conjunto de programas, comprobar que `parse(compact(tree))` da el mismo árbol y que `decode(encode(tree))` también, con árboles profundos generados. *Pull request directo.*
- **Un ejemplo de la sesión de tools.** `examples/tools.ts`, que abre un programa, llama a `find` y `show` y hace un `edit`, con la salida explicada en comentarios. Añádelo a `test/examples.test.ts`. *Pull request directo.*
- **Traducir `ROADMAP.md` al inglés** como `ROADMAP.en.md` y enlazarlo desde el README. *Pull request directo.*
- **Una CLI mínima.** `node src/cli.ts print archivo.nds` imprime el TypeScript de un archivo en texto compacto, o el error del checker con código de salida distinto de cero. *Necesita una issue.*
- **`pnpm ask` con OpenAI.** Que `ask` elija proveedor como la medición, con `BENCH_PROVIDER` o con su propia variable. *Necesita una issue.*
- **Llevar `src/grammar.ts` a Rust**, con los mismos casos que `test/grammar.test.ts`. *Necesita una issue.*
- **Operadores booleanos** `and`, `or` y `not`, en parser, checker, printer, operaciones, binario y Rust. Es un cambio del lenguaje, así que *necesita una issue* antes.

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

En un pull request cabe una idea que se pueda probar sola. TypeScript sigue siendo la referencia de comportamiento.

## Qué no se acepta

- Reabrir JSON, hexadecimal o el AST de otro compilador como formato hacia el modelo.
- Hacer que el modelo emita el fuente final.
- Añadir otro printer mientras el de TypeScript no lleve un tiempo estable.
- Dependencias que solo sirven para una fase futura.
- Tests que llamen a una API de pago o exijan una clave.

Si crees que una decisión de diseño está mal, la issue tiene que decir qué se rompe con la decisión actual y cómo se mediría el arreglo. El pull request espera a esa conversación.

## Issues

Usa un título concreto. En el cuerpo:

1. Qué parte del roadmap toca.
2. Qué comportamiento se quiere poder demostrar.
3. Qué queda fuera de ese cambio.

Un solo idioma por issue, español o inglés.

## Pull requests

`main` está protegida: todo entra por pull request y la CI tiene que pasar (TypeScript y Rust). Haz un fork o una rama, abre el pull request contra `main` y rellena la plantilla.

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
- Un fixture del modelo es un archivo en el repo, no una llamada de red.

## Medición

`pnpm bench` llama a un modelo de verdad y necesita una clave en `.env`; mira `.env.example`. Ni los tests ni la CI la usan. Escribe el informe completo en `bench/openai.md` o en `bench/minimax.md` y rehace las tablas de `BENCH.md`; `pnpm bench:summary` las rehace sin llamar al modelo.

## Conducta y seguridad

Quien participa sigue el [Código de conducta](CODE_OF_CONDUCT.md). Un fallo de seguridad se avisa en privado, como dice [SECURITY.md](SECURITY.md), no en una issue pública.

## Licencia

Con tu pull request aceptas licenciar tu contribución bajo [MIT](LICENSE).
