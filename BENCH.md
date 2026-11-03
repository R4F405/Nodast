# Medición

Cuatro números, el 2026-11-03, con 5 objetivos y tope de 3 intentos. `pnpm bench` repite la pasada y llama a MiniMax. La velocidad interna del motor está aparte, en [bench/engine.md](bench/engine.md).

Los tokens del texto son léxicos: identificadores, números, operadores y signos, con el mismo contador en los dos textos. El buffer no es un flujo de tokens; se compara en bytes. Los tokens de respuesta, cuando MiniMax los informa, son `completion_tokens` de la primera respuesta.

## Validez estructural

Pass@1 es la primera respuesta. Nodast tiene que parsear y pasar `check`. El texto plano tiene que salir de `tsc` sin error y correr sin `SyntaxError` ni `TypeError`.

| | Nodast | Texto plano |
| --- | ---: | ---: |
| Pass@1 | 0/5 (0%) | 5/5 (100%) |
| Aciertos en ≤ 3 intentos | 0/5 (0%) | 5/5 (100%) |
| Reintentos medios tras el primer fallo, solo si luego acierta | — | — |
| Tokens medios de la primera respuesta | 341 | 61 |

| Objetivo | Intentos Nodast | Intentos texto plano |
| --- | ---: | ---: |
| bind the sum of 1 and 2 | 3 y falló | 1 |
| define a function that adds 1 to its number argument | 3 y falló | 1 |
| bind x to 1, then return 0 when x is less than 0, otherwise x | 3 y falló | 1 |
| multiply 3 by 4 | 3 y falló | 1 |
| define a function of two numbers that returns whether the first is less than the second | 3 y falló | 1 |

Nodast no acertó ningún objetivo, ni a la primera ni al tercer intento, así que no hay una corrección que cerrar. El texto plano acertó los cinco a la primera. `completion_tokens` puede incluir el razonamiento del modelo; los dos lados usan el mismo ajuste.

## Payload

| Programa | Compacto, bytes / tokens | Buffer, bytes | TypeScript, bytes / tokens |
| --- | ---: | ---: | ---: |
| let y suma | 19 / 10 | 97 | 20 / 9 |
| función de un argumento | 18 / 11 | 82 | 16 / 10 |
| if con x ligado | 27 / 15 | 142 | 28 / 13 |
| suma de 8191 nodos | 32761 / 16381 | 146348 | 20477 / 12286 |

En estos cuatro programas el buffer pesa más que el TypeScript impreso. El texto compacto queda parecido al fuente en los cortos y más largo en la suma grande.

## Edición

Cambiar el `1` de `(let x (add 1 2) x)` por `9`. La edición local es la mediana de 10.000 veces. La reescritura es una llamada que pide el archivo entero.

| Vía | Tiempo |
| --- | ---: |
| `edit.ts` | 0.009 ms |
| `edit.rs` | 0.002 ms |
| Reescribir el archivo con el modelo | 787 ms |

La edición local queda por debajo de 0.01 ms. Pedirle al modelo el archivo entero tardó 787 ms.
