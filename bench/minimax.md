# Medición

Una pasada el 2026-11-19 con MiniMax-M3 (MiniMax), temperatura 0.01, razonamiento `low`, 5 repeticiones por objetivo y tope de 3 intentos. `pnpm bench` la repite con OpenAI por la API Responses y escribe en `bench/openai.md`; con `BENCH_PROVIDER=minimax` va a MiniMax por chat completions y escribe en `bench/minimax.md`. Los dos rehacen después las tablas del resumen en `BENCH.md`. `BENCH_RUNS`, `BENCH_SIZES`, `BENCH_RENAME`, `BENCH_PARAM`, `BENCH_CONCURRENCY`, `BENCH_TEMPERATURE` y `BENCH_OUT` la ajustan. La velocidad interna del motor está aparte, en [bench/engine.md](engine.md).

Válido: Nodast parsea y pasa `check`; el texto plano sale de `tsc` sin error y corre. Correcto: además, el valor de la última expresión coincide con el oráculo del objetivo, o la función que devuelve da lo esperado con varias entradas. Los dos lados reintentan solo por errores estructurales; el oráculo no se le enseña al modelo.

Si el modelo mete un bloque `<think>` en el texto, como hace MiniMax, se quita antes de juzgar. Un fallo de API, tras 5 reintentos de red, no cuenta como fallo del formato: se excluye y se informa aparte. `completion_tokens` incluye el razonamiento del modelo; la respuesta visible se cuenta aparte con el contador léxico.

## Escribir desde cero

12 objetivos × 5 repeticiones.

|  | Nodast | Texto plano |
| --- | ---: | ---: |
| Pass@1, válido al primer intento | 60/60 (100%) | 60/60 (100%) |
| Válido en ≤ 3 intentos | 60/60 (100%) | 60/60 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 59/60 (98%) | 60/60 (100%) |
| Intentos medios | 1.00 | 1.00 |
| `completion_tokens` medios, todos los intentos | 208 | 180 |
| Respuesta visible, tokens léxicos medios | 18 | 21 |
| Respuesta visible, bytes medios | 32 | 47 |
| Latencia media, todos los intentos | 2619 ms | 2586 ms |
| Fallos de API excluidos | 0 | 0 |
| Fallos | wrong-result ×1 | — |

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
| define a function of three numbers that returns the middle one by value | 4/5 (80%) | 5/5 (100%) |
| bind double to a function that doubles a number and inc to one that adds 1, then return inc applied to double applied to 5 | 5/5 (100%) | 5/5 (100%) |
| define a function that takes a function f and returns f applied to 5 | 5/5 (100%) | 5/5 (100%) |

## Editar un archivo existente

Una cadena de `let` donde cada paso suma o resta una constante. Nodast sin tools recibe el árbol con un id delante de cada nodo y devuelve `(edits ...)`; se prueba con cada `let` en su línea y con todo en una. La variante con tools usa `find`, `show` y `edit` por function calling, hasta 10 llamadas; sus intentos son llamadas a `edit`, que recibe `id`, `expr` y `op` como campos sueltos. Su prompt resume la gramática en una línea. Con ≤ 256 nodos recibe además el árbol entero con ids; con más, solo un resumen. Un `edit` aceptado con `done` cierra la sesión sin otra llamada. Texto con tools es lo que usa un agente de código sobre un archivo normal: `grep` busca líneas, `read` muestra un rango y `replace` cambia un texto exacto que aparezca una sola vez; como un editor, `replace` se aplica siempre y avisa si el archivo deja de compilar o de correr, y se juzga el archivo final. Recibe el archivo entero en el mismo caso en que Nodast con tools recibe el árbol, con el mismo `done` y el mismo tope de llamadas. El texto plano recibe el TypeScript y devuelve el archivo entero. El oráculo es el valor final del programa ya editado.

### Cadena de 50 `let`

203 nodos. TypeScript: 1250 bytes. Árbol con ids: 2202 bytes por líneas, 2202 en una línea.

|  | Nodast, tools | Nodast, ids por líneas | Nodast, ids en una línea | Texto, tools | Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 12/15 (80%) | 13/15 (87%) | 13/15 (87%) | 15/15 (100%) | 15/15 (100%) |
| Válido en ≤ 3 intentos | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 15/15 (100%) | 15/15 (100%) | 13/15 (87%) | 15/15 (100%) | 14/15 (93%) |
| Intentos medios | 1.67 | 1.13 | 1.13 | 1.00 | 1.00 |
| `completion_tokens` medios, todos los intentos | 344 | 329 | 319 | 426 | 629 |
| `prompt_tokens` del primer intento | 1898 | 1523 | 1522 | 1287 | 801 |
| `prompt_tokens` totales, todas las llamadas | 6559 | 1731 | 1730 | 3061 | 801 |
| Llamadas al modelo | 3.0 | 1.1 | 1.1 | 2.0 | 1.0 |
| Respuesta visible, tokens léxicos medios | 6 | 11 | 11 | 2 | 357 |
| Respuesta visible, bytes medios | 150 | 35 | 35 | 118 | 1246 |
| Latencia media, todos los intentos | 5466 ms | 5761 ms | 5020 ms | 11616 ms | 6260 ms |
| Fallos de API excluidos | 0 | 0 | 0 | 0 | 0 |
| Fallos | — | — | wrong-result ×2 | — | wrong-result ×1 |

| Objetivo | Correcto, Nodast, tools | Correcto, Nodast, ids por líneas | Correcto, Nodast, ids en una línea | Correcto, Texto, tools | Correcto, Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| change the constant 70005 to 7 | 5/5 (100%) | 5/5 (100%) | 4/5 (80%) | 5/5 (100%) | 5/5 (100%) |
| change the constant 70044 to 7 | 5/5 (100%) | 5/5 (100%) | 4/5 (80%) | 5/5 (100%) | 4/5 (80%) |
| in the binding of v25, subtract instead of add | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |

### Cadena de 500 `let`

2003 nodos. TypeScript: 13302 bytes. Árbol con ids: 24708 bytes por líneas, 24708 en una línea.

|  | Nodast, tools | Nodast, ids por líneas | Nodast, ids en una línea | Texto, tools | Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 14/15 (93%) | 14/15 (93%) | 14/15 (93%) | 15/15 (100%) | 15/15 (100%) |
| Válido en ≤ 3 intentos | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 15/15 (100%) | 14/15 (93%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) |
| Intentos medios | 1.60 | 1.07 | 1.07 | 1.00 | 1.00 |
| `completion_tokens` medios, todos los intentos | 1534 | 273 | 491 | 657 | 5792 |
| `prompt_tokens` del primer intento | 872 | 11640 | 11643 | 732 | 5751 |
| `prompt_tokens` totales, todas las llamadas | 5539 | 12419 | 12422 | 5993 | 5751 |
| Llamadas al modelo | 4.4 | 1.1 | 1.1 | 3.7 | 1.0 |
| Respuesta visible, tokens léxicos medios | 762 | 10 | 10 | 83 | 3507 |
| Respuesta visible, bytes medios | 2620 | 33 | 33 | 502 | 13298 |
| Latencia media, todos los intentos | 9453 ms | 3456 ms | 5123 ms | 6667 ms | 32366 ms |
| Fallos de API excluidos | 0 | 0 | 0 | 0 | 0 |
| Fallos | — | wrong-result ×1 | — | — | — |

| Objetivo | Correcto, Nodast, tools | Correcto, Nodast, ids por líneas | Correcto, Nodast, ids en una línea | Correcto, Texto, tools | Correcto, Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| change the constant 70050 to 7 | 5/5 (100%) | 4/5 (80%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| change the constant 70440 to 7 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| in the binding of v251, subtract instead of add | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |

### Renombrar en 40 pasos

`rate` aparece en 30 usos y `rate_cap`, que empieza igual, en 10. Objetivo: llamar `scale` a `rate` sin tocar `rate_cap`. Correcto pide el mismo valor y el mismo archivo que un renombrado bien hecho, sin contar espacios. Nodast con tools tiene `op rename`, que sigue los ámbitos; texto con tools tiene `all` en `replace`; las variantes de ids solo tienen `replace`, `insert` y `delete`.

|  | Nodast, tools | Nodast, ids por líneas | Nodast, ids en una línea | Texto, tools | Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 5/5 (100%) | 2/5 (40%) | 1/5 (20%) | 1/5 (20%) | 5/5 (100%) |
| Válido en ≤ 3 intentos | 5/5 (100%) | 5/5 (100%) | 4/5 (80%) | 5/5 (100%) | 5/5 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 5/5 (100%) | 4/5 (80%) | 3/5 (60%) | 5/5 (100%) | 5/5 (100%) |
| Intentos medios | 2.60 | 1.60 | 2.00 | 2.60 | 1.00 |
| `completion_tokens` medios, todos los intentos | 1032 | 12466 | 20499 | 1179 | 636 |
| `prompt_tokens` del primer intento | 2006 | 1635 | 1632 | 1244 | 757 |
| `prompt_tokens` totales, todas las llamadas | 16711 | 2934 | 4077 | 11383 | 757 |
| Llamadas al modelo | 6.0 | 1.6 | 2.0 | 5.4 | 1.0 |
| Respuesta visible, tokens léxicos medios | 46 | 793 | 1076 | 0 | 377 |
| Respuesta visible, bytes medios | 388 | 4676 | 5976 | 207 | 1257 |
| Latencia media, todos los intentos | 13873 ms | 101507 ms | 193449 ms | 60458 ms | 2481 ms |
| Fallos de API excluidos | 0 | 0 | 0 | 0 | 0 |
| Fallos | — | wrong-result ×1 | wrong-result ×1, response ×1 | — | — |

### Renombrar en 400 pasos

`rate` aparece en 300 usos y `rate_cap`, que empieza igual, en 100. Objetivo: llamar `scale` a `rate` sin tocar `rate_cap`. Correcto pide el mismo valor y el mismo archivo que un renombrado bien hecho, sin contar espacios. Nodast con tools tiene `op rename`, que sigue los ámbitos; texto con tools tiene `all` en `replace`; las variantes de ids solo tienen `replace`, `insert` y `delete`.

|  | Nodast, tools | Nodast, ids por líneas | Nodast, ids en una línea | Texto, tools | Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 5/5 (100%) | 1/5 (20%) | 0/3 (0%) | 0/5 (0%) | 5/5 (100%) |
| Válido en ≤ 3 intentos | 5/5 (100%) | 4/5 (80%) | 0/3 (0%) | 5/5 (100%) | 5/5 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 5/5 (100%) | 1/5 (20%) | 0/3 (0%) | 5/5 (100%) | 5/5 (100%) |
| Intentos medios | 2.20 | 2.40 | 3.00 | 2.00 | 1.00 |
| `completion_tokens` medios, todos los intentos | 1510 | 36745 | 49152 | 2716 | 5285 |
| `prompt_tokens` del primer intento | 875 | 12943 | 12940 | 735 | 5180 |
| `prompt_tokens` totales, todas las llamadas | 18691 | 37121 | 49698 | 33456 | 5180 |
| Llamadas al modelo | 8.2 | 2.4 | 3.0 | 8.4 | 1.0 |
| Respuesta visible, tokens léxicos medios | 207 | 8747 | 12675 | 170 | 3617 |
| Respuesta visible, bytes medios | 1151 | 25857 | 33908 | 1026 | 13230 |
| Latencia media, todos los intentos | 25313 ms | 305717 ms | 537757 ms | 48437 ms | 55673 ms |
| Fallos de API excluidos | 0 | 0 | 2 | 0 | 0 |
| Fallos | — | wrong-result ×3, response ×1 | response ×3, model-error ×2 | — | — |

### Añadir un parámetro con 20 llamadas

`step` se llama una vez en cada uno de los 20 pasos. Objetivo: un parámetro nuevo `scale` que multiplica su resultado, y 2 en cada llamada. Correcto pide el valor final y que `step(1, 5)` dé 20, así que multiplicar por 2 dentro de `step` sin parámetro no basta. Nodast con tools tiene `op param`, que cambia la función y todas sus llamadas a la vez; texto con tools tiene que tocar cada llamada, porque cada una lleva su argumento.

|  | Nodast, tools | Nodast, ids por líneas | Nodast, ids en una línea | Texto, tools | Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 5/5 (100%) | 0/5 (0%) | 0/5 (0%) | 0/5 (0%) | 0/5 (0%) |
| Válido en ≤ 3 intentos | 5/5 (100%) | 4/5 (80%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 5/5 (100%) | 4/5 (80%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| Intentos medios | 3.00 | 2.40 | 2.20 | 10.60 | 2.00 |
| `completion_tokens` medios, todos los intentos | 1628 | 12467 | 6017 | 2739 | 966 |
| `prompt_tokens` del primer intento | 1449 | 1078 | 1077 | 1000 | 501 |
| `prompt_tokens` totales, todas las llamadas | 20613 | 2999 | 2690 | 18921 | 1336 |
| Llamadas al modelo | 7.4 | 2.4 | 2.2 | 5.6 | 2.0 |
| Respuesta visible, tokens léxicos medios | 15 | 355 | 327 | 21 | 534 |
| Respuesta visible, bytes medios | 399 | 999 | 919 | 1223 | 1330 |
| Latencia media, todos los intentos | 10451 ms | 120938 ms | 55166 ms | 37415 ms | 9132 ms |
| Fallos de API excluidos | 0 | 0 | 0 | 0 | 0 |
| Fallos | — | not-a-function ×1 | — | — | — |

### Añadir un parámetro con 200 llamadas

`step` se llama una vez en cada uno de los 200 pasos. Objetivo: un parámetro nuevo `scale` que multiplica su resultado, y 2 en cada llamada. Correcto pide el valor final y que `step(1, 5)` dé 20, así que multiplicar por 2 dentro de `step` sin parámetro no basta. Nodast con tools tiene `op param`, que cambia la función y todas sus llamadas a la vez; texto con tools tiene que tocar cada llamada, porque cada una lleva su argumento.

|  | Nodast, tools | Nodast, ids por líneas | Nodast, ids en una línea | Texto, tools | Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 5/5 (100%) | 1/5 (20%) | 0/5 (0%) | 0/5 (0%) | 0/5 (0%) |
| Válido en ≤ 3 intentos | 5/5 (100%) | 2/5 (40%) | 4/5 (80%) | 5/5 (100%) | 5/5 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 5/5 (100%) | 2/5 (40%) | 4/5 (80%) | 5/5 (100%) | 5/5 (100%) |
| Intentos medios | 2.00 | 2.60 | 2.60 | 82.40 | 2.00 |
| `completion_tokens` medios, todos los intentos | 2225 | 18630 | 18965 | 7587 | 6226 |
| `prompt_tokens` del primer intento | 890 | 6012 | 6024 | 750 | 2481 |
| `prompt_tokens` totales, todas las llamadas | 26138 | 20221 | 20099 | 61211 | 7816 |
| Llamadas al modelo | 10.0 | 2.6 | 2.6 | 8.6 | 2.0 |
| Respuesta visible, tokens léxicos medios | 68 | 3660 | 4020 | 264 | 4854 |
| Respuesta visible, bytes medios | 665 | 11155 | 12209 | 4525 | 13098 |
| Latencia media, todos los intentos | 40095 ms | 239192 ms | 197141 ms | 45821 ms | 33743 ms |
| Fallos de API excluidos | 0 | 0 | 0 | 0 | 0 |
| Fallos | — | not-a-function ×3 | not-a-function ×1 | — | — |

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
