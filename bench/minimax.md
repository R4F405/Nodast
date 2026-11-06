# Medición

Una pasada el 2026-11-05 con MiniMax-M3, temperatura 0.01, 5 repeticiones por objetivo y tope de 3 intentos. Es una pasada anterior a la variante de texto con tools y a las tareas de renombrar y añadir un parámetro. `BENCH_PROVIDER=minimax pnpm bench` la repite con el bench actual y escribe aquí. `BENCH_RUNS`, `BENCH_SIZES`, `BENCH_CONCURRENCY` y `BENCH_TEMPERATURE` la ajustan. La velocidad interna del motor está aparte, en [bench/engine.md](engine.md).

Válido: Nodast parsea y pasa `check`; el texto plano sale de `tsc` sin error y corre. Correcto: además, el valor de la última expresión coincide con el oráculo del objetivo, o la función que devuelve da lo esperado con varias entradas. Los dos lados reintentan solo por errores estructurales; el oráculo no se le enseña al modelo.

El bloque `<think>` que MiniMax mete en `content` se quita antes de juzgar. Un fallo de API, tras 5 reintentos de red, no cuenta como fallo del formato: se excluye y se informa aparte. `completion_tokens` incluye el razonamiento del modelo; la respuesta visible se cuenta aparte con el contador léxico.

## Escribir desde cero

12 objetivos × 5 repeticiones.

|  | Nodast | Texto plano |
| --- | ---: | ---: |
| Pass@1, válido al primer intento | 54/60 (90%) | 60/60 (100%) |
| Válido en ≤ 3 intentos | 60/60 (100%) | 60/60 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 60/60 (100%) | 60/60 (100%) |
| Intentos medios | 1.15 | 1.00 |
| `completion_tokens` medios, todos los intentos | 827 | 203 |
| Respuesta visible, tokens léxicos medios | 21 | 21 |
| Respuesta visible, bytes medios | 39 | 46 |
| Latencia media, todos los intentos | 8542 ms | 1928 ms |
| Fallos de API excluidos | 0 | 0 |
| Fallos | — | — |

| Objetivo | Correcto, Nodast | Correcto, Texto plano |
| --- | ---: | ---: |
| bind the sum of 1 and 2 | 5/5 (100%) | 5/5 (100%) |
| define a function that adds 1 to its number argument | 5/5 (100%) | 5/5 (100%) |
| bind x to 1, then return 0 when x is less than 0, otherwise x | 5/5 (100%) | 5/5 (100%) |
| multiply 3 by 4 | 5/5 (100%) | 5/5 (100%) |
| define a function of two numbers that returns whether the first is less than the second | 5/5 (100%) | 5/5 (100%) |
| define a function that returns the larger of its two number arguments | 5/5 (100%) | 5/5 (100%) |
| compute the absolute value of -7 with a conditional | 5/5 (100%) | 5/5 (100%) |
| define a function that returns 1 when its number argument is zero and 0 otherwise | 5/5 (100%) | 5/5 (100%) |
| define a function that clamps its number argument between 0 and 10 | 5/5 (100%) | 5/5 (100%) |
| define a function of three numbers that returns the middle one by value | 5/5 (100%) | 5/5 (100%) |
| bind double to a function that doubles a number and inc to one that adds 1, then return inc applied to double applied to 5 | 5/5 (100%) | 5/5 (100%) |
| define a function that takes a function f and returns f applied to 5 | 5/5 (100%) | 5/5 (100%) |

## Editar un archivo existente

Una cadena de `let` donde cada paso suma o resta una constante. Nodast sin tools recibe el árbol con un id delante de cada nodo y devuelve `(edits ...)`; se prueba con cada `let` en su línea y con todo en una. La variante con tools usa `find`, `show` y `edit` por function calling, hasta 10 llamadas; sus intentos son llamadas a `edit`. Con ≤ 256 nodos recibe además el árbol entero con ids; con más, solo un resumen. Un `edit` aceptado con `done` cierra la sesión sin otra llamada. El texto plano recibe el TypeScript y devuelve el archivo entero. El oráculo es el valor final del programa ya editado.

### Cadena de 50 `let`

203 nodos. TypeScript: 1250 bytes. Árbol con ids: 2202 bytes por líneas, 2202 en una línea.

|  | Nodast, tools | Nodast, ids por líneas | Nodast, ids en una línea | Texto plano |
| --- | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 12/15 (80%) | 12/15 (80%) | 13/15 (87%) | 15/15 (100%) |
| Válido en ≤ 3 intentos | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 15/15 (100%) | 14/15 (93%) | 13/15 (87%) | 14/15 (93%) |
| Intentos medios | 1.20 | 1.20 | 1.13 | 1.00 |
| `completion_tokens` medios, todos los intentos | 288 | 285 | 466 | 642 |
| `prompt_tokens` del primer intento | 2006 | 1519 | 1518 | 801 |
| `prompt_tokens` totales, todas las llamadas | 3941 | 1832 | 1726 | 801 |
| Llamadas al modelo | 1.9 | 1.2 | 1.1 | 1.0 |
| Respuesta visible, tokens léxicos medios | 1 | 13 | 11 | 357 |
| Respuesta visible, bytes medios | 78 | 38 | 35 | 1246 |
| Latencia media, todos los intentos | 3406 ms | 2814 ms | 4736 ms | 2570 ms |
| Fallos de API excluidos | 0 | 0 | 0 | 0 |
| Fallos | — | wrong-result ×1 | wrong-result ×2 | wrong-result ×1 |

| Objetivo | Correcto, Nodast, tools | Correcto, Nodast, ids por líneas | Correcto, Nodast, ids en una línea | Correcto, Texto plano |
| --- | ---: | ---: | ---: | ---: |
| change the constant 70005 to 7 | 5/5 (100%) | 5/5 (100%) | 3/5 (60%) | 5/5 (100%) |
| change the constant 70044 to 7 | 5/5 (100%) | 4/5 (80%) | 5/5 (100%) | 4/5 (80%) |
| in the binding of v25, subtract instead of add | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |

### Cadena de 500 `let`

2003 nodos. TypeScript: 13302 bytes. Árbol con ids: 24708 bytes por líneas, 24708 en una línea.

|  | Nodast, tools | Nodast, ids por líneas | Nodast, ids en una línea | Texto plano |
| --- | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 12/15 (80%) | 13/15 (87%) | 13/15 (87%) | 15/15 (100%) |
| Válido en ≤ 3 intentos | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 15/15 (100%) | 15/15 (100%) | 14/15 (93%) | 15/15 (100%) |
| Intentos medios | 1.20 | 1.13 | 1.13 | 1.00 |
| `completion_tokens` medios, todos los intentos | 300 | 400 | 341 | 5851 |
| `prompt_tokens` del primer intento | 980 | 11635 | 11634 | 5749 |
| `prompt_tokens` totales, todas las llamadas | 3231 | 13193 | 13192 | 5749 |
| Llamadas al modelo | 2.8 | 1.1 | 1.1 | 1.0 |
| Respuesta visible, tokens léxicos medios | 6 | 11 | 11 | 3507 |
| Respuesta visible, bytes medios | 118 | 37 | 37 | 13298 |
| Latencia media, todos los intentos | 4346 ms | 5061 ms | 4487 ms | 21573 ms |
| Fallos de API excluidos | 0 | 0 | 0 | 0 |
| Fallos | — | — | wrong-result ×1 | — |

| Objetivo | Correcto, Nodast, tools | Correcto, Nodast, ids por líneas | Correcto, Nodast, ids en una línea | Correcto, Texto plano |
| --- | ---: | ---: | ---: | ---: |
| change the constant 70050 to 7 | 5/5 (100%) | 5/5 (100%) | 4/5 (80%) | 5/5 (100%) |
| change the constant 70440 to 7 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| in the binding of v251, subtract instead of add | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |

## Payload

Tokens léxicos: identificadores, números, operadores y signos, con el mismo contador en los dos textos. El buffer se compara en bytes.

| Programa | Compacto, bytes / tokens | Buffer, bytes | TypeScript, bytes / tokens |
| --- | ---: | ---: | ---: |
| let y suma | 19 / 10 | 97 | 20 / 9 |
| función de un argumento | 18 / 11 | 82 | 16 / 10 |
| if con x ligado | 27 / 15 | 142 | 28 / 13 |
| cadena de 50 let | 1295 / 456 | 3707 | 1250 / 357 |
| cadena de 500 let | 13797 / 4506 | 38862 | 13302 / 3507 |
| suma de 8191 nodos | 32761 / 16381 | 146348 | 20477 / 12286 |
