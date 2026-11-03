# Contribuir

Nodast está en fase de diseño ejecutable: las decisiones de formato ya están tomadas y el código del PoC todavía no existe. Un cambio entra si acerca el [roadmap](ROADMAP.md) y respeta las decisiones cerradas del [README](README.md).

## Antes de escribir código

Abre una issue si el cambio hace alguna de estas cosas:

- añade un tipo de nodo
- cambia el texto compacto, las operaciones o el error del checker
- suma un lenguaje de salida
- mueve trabajo de una fase futura a la fase actual

Un arreglo de documentación, un test del comportamiento ya descrito o un bug claro pueden ir directo en pull request.

## Qué se acepta ahora

Trabajo de las fases 1 a 4 del roadmap, en orden. Una fase no se salta: el printer no se fusiona sin parser, el contrato del modelo no se fusiona sin checker.

En un pull request cabe una fase, o un corte vertical pequeño de una fase que se pueda probar solo. No cabe “el PoC entero” en un único diff.

## Qué no se acepta

- Reabrir JSON, hexadecimal o el AST de otro compilador como formato hacia el modelo.
- Hacer que el modelo emita el fuente final.
- Añadir Rust, Python u otro printer antes de cerrar el de TypeScript.
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
- Un editor que respete `.editorconfig`

```sh
pnpm install
pnpm test
pnpm typecheck
```

## Licencia

Con tu pull request aceptas licenciar tu contribución bajo [MIT](LICENSE).
