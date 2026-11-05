# Medición

Una pasada el 2026-11-05 con gpt-6.1-sol (OpenAI), sin temperatura, que el modelo no acepta, razonamiento `low`, 5 repeticiones por objetivo y tope de 3 intentos. `pnpm bench` la repite con MiniMax por chat completions y escribe en `BENCH.md`; con `BENCH_PROVIDER=openai` va a OpenAI por la API Responses y escribe en `bench/openai.md`. `BENCH_RUNS`, `BENCH_SIZES`, `BENCH_CONCURRENCY`, `BENCH_TEMPERATURE` y `BENCH_OUT` la ajustan. La velocidad interna del motor está aparte, en [bench/engine.md](engine.md).

Válido: Nodast parsea y pasa `check`; el texto plano sale de `tsc` sin error y corre. Correcto: además, el valor de la última expresión coincide con el oráculo del objetivo, o la función que devuelve da lo esperado con varias entradas. Los dos lados reintentan solo por errores estructurales; el oráculo no se le enseña al modelo.

Si el modelo mete un bloque `<think>` en el texto, como hace MiniMax, se quita antes de juzgar. Un fallo de API, tras 5 reintentos de red, no cuenta como fallo del formato: se excluye y se informa aparte. `completion_tokens` incluye el razonamiento del modelo; la respuesta visible se cuenta aparte con el contador léxico.

## Escribir desde cero

12 objetivos × 5 repeticiones.

|  | Nodast | Texto plano |
| --- | ---: | ---: |
| Pass@1, válido al primer intento | 60/60 (100%) | 60/60 (100%) |
| Válido en ≤ 3 intentos | 60/60 (100%) | 60/60 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 60/60 (100%) | 60/60 (100%) |
| Intentos medios | 1.00 | 1.00 |
| `completion_tokens` medios, todos los intentos | 23 | 25 |
| Respuesta visible, tokens léxicos medios | 19 | 21 |
| Respuesta visible, bytes medios | 34 | 45 |
| Latencia media, todos los intentos | 1931 ms | 2116 ms |
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

Una cadena de `let` donde cada paso suma o resta una constante. Nodast sin tools recibe el árbol con un id delante de cada nodo y devuelve `(edits ...)`; se prueba con cada `let` en su línea y con todo en una. La variante con tools usa `find`, `show` y `edit` por function calling, hasta 10 llamadas; sus intentos son llamadas a `edit`, que recibe `id`, `expr` y `op` como campos sueltos. Su prompt resume la gramática en una línea. Con ≤ 256 nodos recibe además el árbol entero con ids; con más, solo un resumen. Un `edit` aceptado con `done` cierra la sesión sin otra llamada. Texto con tools es lo que usa un agente de código sobre un archivo normal: `grep` busca líneas, `read` muestra un rango y `replace` cambia un texto exacto que aparezca una sola vez; como un editor, `replace` se aplica siempre y avisa si el archivo deja de compilar o de correr, y se juzga el archivo final. Recibe el archivo entero en el mismo caso en que Nodast con tools recibe el árbol, con el mismo `done` y el mismo tope de llamadas. El texto plano recibe el TypeScript y devuelve el archivo entero. El oráculo es el valor final del programa ya editado.

### Cadena de 50 `let`

203 nodos. TypeScript: 1250 bytes. Árbol con ids: 2202 bytes por líneas, 2202 en una línea.

|  | Nodast, tools | Nodast, ids por líneas | Nodast, ids en una línea | Texto, tools | Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) |
| Válido en ≤ 3 intentos | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) |
| Intentos medios | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| `completion_tokens` medios, todos los intentos | 36 | 15 | 15 | 48 | 563 |
| `prompt_tokens` del primer intento | 1377 | 1331 | 1330 | 822 | 609 |
| `prompt_tokens` totales, todas las llamadas | 1377 | 1331 | 1330 | 822 | 609 |
| Llamadas al modelo | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |
| Respuesta visible, tokens léxicos medios | 0 | 9 | 9 | 0 | 357 |
| Respuesta visible, bytes medios | 65 | 28 | 28 | 87 | 1246 |
| Latencia media, todos los intentos | 2238 ms | 1831 ms | 1941 ms | 2155 ms | 5029 ms |
| Fallos de API excluidos | 0 | 0 | 0 | 0 | 0 |
| Fallos | — | — | — | — | — |

| Objetivo | Correcto, Nodast, tools | Correcto, Nodast, ids por líneas | Correcto, Nodast, ids en una línea | Correcto, Texto, tools | Correcto, Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| change the constant 70005 to 7 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| change the constant 70044 to 7 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| in the binding of v25, subtract instead of add | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |

### Cadena de 500 `let`

2003 nodos. TypeScript: 13302 bytes. Árbol con ids: 24708 bytes por líneas, 24708 en una línea.

|  | Nodast, tools | Nodast, ids por líneas | Nodast, ids en una línea | Texto, tools | Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) |
| Válido en ≤ 3 intentos | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) |
| Intentos medios | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| `completion_tokens` medios, todos los intentos | 61 | 15 | 15 | 67 | 5513 |
| `prompt_tokens` del primer intento | 355 | 11447 | 11446 | 267 | 5559 |
| `prompt_tokens` totales, todas las llamadas | 772 | 11447 | 11446 | 581 | 5559 |
| Llamadas al modelo | 2.0 | 1.0 | 1.0 | 2.0 | 1.0 |
| Respuesta visible, tokens léxicos medios | 0 | 9 | 9 | 0 | 3507 |
| Respuesta visible, bytes medios | 103 | 30 | 30 | 107 | 13298 |
| Latencia media, todos los intentos | 4636 ms | 2058 ms | 1840 ms | 4451 ms | 32773 ms |
| Fallos de API excluidos | 0 | 0 | 0 | 0 | 0 |
| Fallos | — | — | — | — | — |

| Objetivo | Correcto, Nodast, tools | Correcto, Nodast, ids por líneas | Correcto, Nodast, ids en una línea | Correcto, Texto, tools | Correcto, Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| change the constant 70050 to 7 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| change the constant 70440 to 7 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| in the binding of v251, subtract instead of add | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |

### Renombrar en 40 pasos

`rate` aparece en 30 usos y `rate_cap`, que empieza igual, en 10. Objetivo: llamar `scale` a `rate` sin tocar `rate_cap`. Correcto pide el mismo valor y el mismo archivo que un renombrado bien hecho, sin contar espacios. Nodast con tools tiene `op rename`, que sigue los ámbitos; texto con tools tiene `all` en `replace`; las variantes de ids solo tienen `replace`, `insert` y `delete`.

|  | Nodast, tools | Nodast, ids por líneas | Nodast, ids en una línea | Texto, tools | Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 1/5 (20%) | 5/5 (100%) |
| Válido en ≤ 3 intentos | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| Intentos medios | 1.00 | 1.00 | 1.00 | 2.00 | 1.00 |
| `completion_tokens` medios, todos los intentos | 34 | 677 | 683 | 68 | 517 |
| `prompt_tokens` del primer intento | 1489 | 1443 | 1440 | 778 | 565 |
| `prompt_tokens` totales, todas las llamadas | 1489 | 1443 | 1440 | 1618 | 565 |
| Llamadas al modelo | 1.0 | 1.0 | 1.0 | 2.0 | 1.0 |
| Respuesta visible, tokens léxicos medios | 0 | 543 | 543 | 0 | 377 |
| Respuesta visible, bytes medios | 62 | 1468 | 1468 | 126 | 1257 |
| Latencia media, todos los intentos | 2161 ms | 7297 ms | 6829 ms | 4699 ms | 4714 ms |
| Fallos de API excluidos | 0 | 0 | 0 | 0 | 0 |
| Fallos | — | — | — | — | — |

### Renombrar en 400 pasos

`rate` aparece en 300 usos y `rate_cap`, que empieza igual, en 100. Objetivo: llamar `scale` a `rate` sin tocar `rate_cap`. Correcto pide el mismo valor y el mismo archivo que un renombrado bien hecho, sin contar espacios. Nodast con tools tiene `op rename`, que sigue los ámbitos; texto con tools tiene `all` en `replace`; las variantes de ids solo tienen `replace`, `insert` y `delete`.

|  | Nodast, tools | Nodast, ids por líneas | Nodast, ids en una línea | Texto, tools | Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 5/5 (100%) | 5/5 (100%) | 3/5 (60%) | 5/5 (100%) | 5/5 (100%) |
| Válido en ≤ 3 intentos | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| Intentos medios | 1.00 | 1.00 | 1.40 | 2.00 | 1.00 |
| `completion_tokens` medios, todos los intentos | 55 | 5641 | 8504 | 80 | 4927 |
| `prompt_tokens` del primer intento | 358 | 12751 | 12748 | 270 | 4975 |
| `prompt_tokens` totales, todas las llamadas | 907 | 12751 | 20187 | 1187 | 4975 |
| Llamadas al modelo | 2.0 | 1.0 | 1.4 | 3.0 | 1.0 |
| Respuesta visible, tokens léxicos medios | 0 | 5223 | 7314 | 0 | 3617 |
| Respuesta visible, bytes medios | 97 | 15255 | 21355 | 126 | 13230 |
| Latencia media, todos los intentos | 4370 ms | 37057 ms | 60165 ms | 6742 ms | 29101 ms |
| Fallos de API excluidos | 0 | 0 | 0 | 0 | 0 |
| Fallos | — | — | — | — | — |

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
