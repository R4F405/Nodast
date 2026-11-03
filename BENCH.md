# Medición

Cuatro números, el 2026-11-03, con MiniMax-M3.1-Flash, 5 objetivos y tope de 3 intentos. `pnpm bench` repite la pasada y llama a MiniMax. La velocidad interna del motor está aparte, en [bench/engine.md](bench/engine.md).

Los tokens del texto son léxicos: identificadores, números, operadores y signos, con el mismo contador en los dos textos. El buffer no es un flujo de tokens; se compara en bytes. Los tokens de respuesta, cuando MiniMax los informa, son `completion_tokens` de la primera respuesta.

## Validez estructural

Pass@1 es la primera respuesta. Nodast tiene que parsear y pasar `check`. El texto plano tiene que salir de `tsc` sin error y correr sin `SyntaxError` ni `TypeError`.

| | Nodast | Texto plano |
| --- | ---: | ---: |
| Pass@1 | 2/5 (40%) | 4/5 (80%) |
| Aciertos en ≤ 3 intentos | 3/5 (60%) | 5/5 (100%) |
| Reintentos medios tras el primer fallo, solo si luego acierta | 1.0 | 1.0 |
| Tokens medios de la primera respuesta | 174 | 50 |

| Objetivo | Intentos Nodast | Intentos texto plano |
| --- | ---: | ---: |
| bind the sum of 1 and 2 | 1 | 1 |
| define a function that adds 1 to its number argument | 2 y falló (model-error) | 1 |
| bind x to 1, then return 0 when x is less than 0, otherwise x | 2 | 1 |
| multiply 3 by 4 | 1 | 1 |
| define a function of two numbers that returns whether the first is less than the second | 3 y falló (parse) | 2 |

## Payload

| Programa | Compacto, bytes / tokens | Buffer, bytes | TypeScript, bytes / tokens |
| --- | ---: | ---: | ---: |
| let y suma | 19 / 10 | 97 | 20 / 9 |
| función de un argumento | 18 / 11 | 82 | 16 / 10 |
| if con x ligado | 27 / 15 | 142 | 28 / 13 |
| suma de 8191 nodos | 32761 / 16381 | 146348 | 20477 / 12286 |

## Edición

Cambiar el `1` de `(let x (add 1 2) x)` por `9`. La edición local es la mediana de 10.000 veces. La reescritura es una llamada que pide el archivo entero.

| Vía | Tiempo |
| --- | ---: |
| `edit.ts` | 0.009 ms |
| `edit.rs` | 0.002 ms |
| Reescribir el archivo con el modelo | 803 ms |
