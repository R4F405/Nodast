# Medición

Una pasada el 2026-11-19 con MiniMax-M3 (MiniMax), temperatura 0.01, razonamiento `low`, 5 repeticiones por objetivo, tope de 3 intentos y `BENCH_CONCURRENCY=4`. `pnpm bench` la repite con OpenAI por la API Responses y escribe en `bench/openai.md`; con `BENCH_PROVIDER=minimax` va a MiniMax por chat completions y escribe en `bench/minimax.md`. Los dos rehacen después las tablas del resumen en `BENCH.md`. `BENCH_RUNS`, `BENCH_SIZES`, `BENCH_RENAME`, `BENCH_PARAM`, `BENCH_CONCURRENCY`, `BENCH_TEMPERATURE` y `BENCH_OUT` la ajustan. La velocidad interna del motor está aparte, en [bench/engine.md](engine.md). La pasada anterior del mismo día, con el código de antes de `rename` y `param` en `(edits ...)`, de las tools más directas y del mensaje de sistema, está en el historial de git (commit `474e4a2`).

Válido: Nodast parsea y pasa `check`; el texto plano sale de `tsc` sin error y corre. Correcto: además, el valor de la última expresión coincide con el oráculo del objetivo, o la función que devuelve da lo esperado con varias entradas. Los dos lados reintentan solo por errores estructurales; el oráculo no se le enseña al modelo.

Cada variante manda sus instrucciones fijas como mensaje de sistema y la tarea (objetivo, programa o archivo) como mensaje de usuario, igual en Nodast y en TypeScript. Una respuesta cortada dentro de `<think>` cuenta como intento fallido, no como fallo de API. Los intentos son las respuestas, o en tools las llamadas que editan, hasta la primera aceptada. La respuesta visible cuenta el texto y los valores de los argumentos de las tools.

Si el modelo mete un bloque `<think>` en el texto, como hace MiniMax, se quita antes de juzgar. Un fallo de API, tras 5 reintentos de red, no cuenta como fallo del formato: se excluye y se informa aparte. `completion_tokens` incluye el razonamiento del modelo; la respuesta visible se cuenta aparte con el contador léxico.

## Escribir desde cero

12 objetivos × 5 repeticiones.

|  | Nodast | Texto plano |
| --- | ---: | ---: |
| Pass@1, válido al primer intento | 60/60 (100%) | 60/60 (100%) |
| Válido en ≤ 3 intentos | 60/60 (100%) | 60/60 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 60/60 (100%) | 57/60 (95%) |
| Intentos medios hasta el primero aceptado | 1.00 | 1.00 |
| `completion_tokens` medios, todos los intentos | 104 | 195 |
| de ellos, razonamiento | 82 | 172 |
| Respuesta visible, tokens léxicos medios (texto y argumentos de tools) | 20 | 22 |
| Respuesta visible, bytes medios | 35 | 55 |
| Latencia media, todos los intentos | 1568 ms | 3509 ms |
| Fallos de API excluidos | 0 | 0 |
| Fallos | — | wrong-result ×3 |

| Objetivo | Correcto, Nodast | Correcto, Texto plano |
| --- | ---: | ---: |
| bind the sum of 1 and 2 | 5/5 (100%) | 3/5 (60%) |
| define a function that adds 1 to its number argument | 5/5 (100%) | 5/5 (100%) |
| bind x to 1, then return 0 when x is less than 0, otherwise x | 5/5 (100%) | 4/5 (80%) |
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
| Pass@1, válido al primer intento | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 10/15 (67%) | 15/15 (100%) |
| Válido en ≤ 3 intentos | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) |
| Intentos medios hasta el primero aceptado | 1.00 | 1.00 | 1.00 | 1.33 | 1.00 |
| `completion_tokens` medios, todos los intentos | 222 | 147 | 174 | 467 | 633 |
| de ellos, razonamiento | 141 | 135 | 162 | 368 | 72 |
| `prompt_tokens` del primer intento | 1956 | 1638 | 1637 | 1303 | 809 |
| `prompt_tokens` totales, todas las llamadas | 3602 | 1638 | 1637 | 2755 | 809 |
| de ellos, en caché | 3113 | 1152 | 1212 | 2334 | 661 |
| Llamadas al modelo | 1.7 | 1.0 | 1.0 | 1.9 | 1.0 |
| Respuesta visible, tokens léxicos medios (texto y argumentos de tools) | 9 | 10 | 10 | 25 | 357 |
| Respuesta visible, bytes medios | 80 | 29 | 29 | 126 | 1246 |
| Latencia media, todos los intentos | 3534 ms | 2013 ms | 2632 ms | 4164 ms | 4070 ms |
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
| Correcto en ≤ 3 intentos (oráculo) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 15/15 (100%) | 14/15 (93%) |
| Intentos medios hasta el primero aceptado | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| `completion_tokens` medios, todos los intentos | 252 | 157 | 126 | 381 | 5746 |
| de ellos, razonamiento | 110 | 145 | 112 | 167 | 234 |
| `prompt_tokens` del primer intento | 955 | 11755 | 11750 | 745 | 5759 |
| `prompt_tokens` totales, todas las llamadas | 3410 | 11755 | 11750 | 5471 | 5759 |
| de ellos, en caché | 2827 | 9344 | 8586 | 4172 | 4598 |
| Llamadas al modelo | 2.9 | 1.0 | 1.0 | 4.1 | 1.0 |
| Respuesta visible, tokens léxicos medios (texto y argumentos de tools) | 31 | 9 | 9 | 69 | 3507 |
| Respuesta visible, bytes medios | 189 | 30 | 30 | 329 | 13298 |
| Latencia media, todos los intentos | 3594 ms | 2676 ms | 2117 ms | 6649 ms | 33507 ms |
| Fallos de API excluidos | 0 | 0 | 0 | 0 | 0 |
| Fallos | — | — | — | — | wrong-result ×1 |

| Objetivo | Correcto, Nodast, tools | Correcto, Nodast, ids por líneas | Correcto, Nodast, ids en una línea | Correcto, Texto, tools | Correcto, Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| change the constant 70050 to 7 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| change the constant 70440 to 7 | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 4/5 (80%) |
| in the binding of v251, subtract instead of add | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |

### Renombrar en 40 pasos

`rate` aparece en 30 usos y `rate_cap`, que empieza igual, en 10. Objetivo: llamar `scale` a `rate` sin tocar `rate_cap`. Correcto pide el mismo valor y el mismo archivo que un renombrado bien hecho, sin contar espacios. Nodast con tools tiene `op rename` y las variantes de ids `(rename id name)`, que siguen los ámbitos; texto con tools tiene `all` en `replace`.

|  | Nodast, tools | Nodast, ids por líneas | Nodast, ids en una línea | Texto, tools | Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 4/5 (80%) | 5/5 (100%) | 5/5 (100%) | 1/5 (20%) | 5/5 (100%) |
| Válido en ≤ 3 intentos | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| Intentos medios hasta el primero aceptado | 1.20 | 1.00 | 1.00 | 1.80 | 1.00 |
| `completion_tokens` medios, todos los intentos | 603 | 140 | 133 | 681 | 603 |
| de ellos, razonamiento | 432 | 131 | 124 | 557 | 87 |
| `prompt_tokens` del primer intento | 2081 | 1746 | 1743 | 1256 | 766 |
| `prompt_tokens` totales, todas las llamadas | 9539 | 1746 | 1743 | 3108 | 766 |
| de ellos, en caché | 8422 | 1357 | 1357 | 1741 | 410 |
| Llamadas al modelo | 3.4 | 1.0 | 1.0 | 2.0 | 1.0 |
| Respuesta visible, tokens léxicos medios (texto y argumentos de tools) | 39 | 8 | 8 | 23 | 377 |
| Respuesta visible, bytes medios | 234 | 25 | 25 | 160 | 1257 |
| Latencia media, todos los intentos | 14300 ms | 3251 ms | 4629 ms | 16078 ms | 5541 ms |
| Fallos de API excluidos | 0 | 0 | 0 | 0 | 0 |
| Fallos | — | — | — | — | — |

### Renombrar en 400 pasos

`rate` aparece en 300 usos y `rate_cap`, que empieza igual, en 100. Objetivo: llamar `scale` a `rate` sin tocar `rate_cap`. Correcto pide el mismo valor y el mismo archivo que un renombrado bien hecho, sin contar espacios. Nodast con tools tiene `op rename` y las variantes de ids `(rename id name)`, que siguen los ámbitos; texto con tools tiene `all` en `replace`.

|  | Nodast, tools | Nodast, ids por líneas | Nodast, ids en una línea | Texto, tools | Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 2/5 (40%) | 5/5 (100%) |
| Válido en ≤ 3 intentos | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| Intentos medios hasta el primero aceptado | 1.00 | 1.00 | 1.00 | 1.60 | 1.00 |
| `completion_tokens` medios, todos los intentos | 955 | 160 | 144 | 1900 | 5326 |
| de ellos, razonamiento | 553 | 151 | 133 | 1286 | 400 |
| `prompt_tokens` del primer intento | 936 | 13054 | 13051 | 748 | 5175 |
| `prompt_tokens` totales, todas las llamadas | 12406 | 13054 | 13051 | 27147 | 5175 |
| de ellos, en caché | 11110 | 10368 | 10466 | 23267 | 4165 |
| Llamadas al modelo | 6.4 | 1.0 | 1.0 | 9.0 | 1.0 |
| Respuesta visible, tokens léxicos medios (texto y argumentos de tools) | 141 | 8 | 8 | 173 | 3617 |
| Respuesta visible, bytes medios | 680 | 25 | 25 | 863 | 13230 |
| Latencia media, todos los intentos | 15615 ms | 2800 ms | 2791 ms | 16641 ms | 20539 ms |
| Fallos de API excluidos | 0 | 0 | 0 | 0 | 0 |
| Fallos | — | — | — | — | — |

### Añadir un parámetro con 20 llamadas

`step` se llama una vez en cada uno de los 20 pasos. Objetivo: un parámetro nuevo `scale` que multiplica su resultado, y 2 en cada llamada. Correcto pide el valor final y que `step(1, 5)` dé 20, así que multiplicar por 2 dentro de `step` sin parámetro no basta. Nodast con tools tiene `op param` y las variantes de ids `(param id name index expr)`, que cambian la función y todas sus llamadas a la vez; texto con tools tiene que tocar cada llamada, porque cada una lleva su argumento.

|  | Nodast, tools | Nodast, ids por líneas | Nodast, ids en una línea | Texto, tools | Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 0/5 (0%) | 1/5 (20%) |
| Válido en ≤ 3 intentos | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| Intentos medios hasta el primero aceptado | 1.00 | 1.00 | 1.00 | 6.00 | 1.80 |
| `completion_tokens` medios, todos los intentos | 1006 | 921 | 644 | 1879 | 764 |
| de ellos, razonamiento | 693 | 892 | 615 | 1126 | 203 |
| `prompt_tokens` del primer intento | 1511 | 1189 | 1188 | 1066 | 509 |
| `prompt_tokens` totales, todas las llamadas | 14561 | 1189 | 1188 | 5994 | 1183 |
| de ellos, en caché | 13517 | 976 | 975 | 3793 | 819 |
| Llamadas al modelo | 6.6 | 1.0 | 1.0 | 2.6 | 1.8 |
| Respuesta visible, tokens léxicos medios (texto y argumentos de tools) | 52 | 23 | 23 | 481 | 481 |
| Respuesta visible, bytes medios | 310 | 63 | 63 | 1412 | 1200 |
| Latencia media, todos los intentos | 19693 ms | 15272 ms | 7650 ms | 10809 ms | 6018 ms |
| Fallos de API excluidos | 0 | 0 | 0 | 0 | 0 |
| Fallos | — | — | — | — | — |

### Añadir un parámetro con 200 llamadas

`step` se llama una vez en cada uno de los 200 pasos. Objetivo: un parámetro nuevo `scale` que multiplica su resultado, y 2 en cada llamada. Correcto pide el valor final y que `step(1, 5)` dé 20, así que multiplicar por 2 dentro de `step` sin parámetro no basta. Nodast con tools tiene `op param` y las variantes de ids `(param id name index expr)`, que cambian la función y todas sus llamadas a la vez; texto con tools tiene que tocar cada llamada, porque cada una lleva su argumento.

|  | Nodast, tools | Nodast, ids por líneas | Nodast, ids en una línea | Texto, tools | Texto plano |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 0/5 (0%) | 1/5 (20%) |
| Válido en ≤ 3 intentos | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| Intentos medios hasta el primero aceptado | 1.00 | 1.00 | 1.00 | 46.00 | 1.80 |
| `completion_tokens` medios, todos los intentos | 966 | 1043 | 811 | 7259 | 5528 |
| de ellos, razonamiento | 632 | 1014 | 782 | 3218 | 428 |
| `prompt_tokens` del primer intento | 951 | 6123 | 6122 | 776 | 2489 |
| `prompt_tokens` totales, todas las llamadas | 10037 | 6123 | 6122 | 65947 | 6763 |
| de ellos, en caché | 8534 | 6080 | 4933 | 60083 | 5258 |
| Llamadas al modelo | 5.8 | 1.0 | 1.0 | 9.2 | 1.8 |
| Respuesta visible, tokens léxicos medios (texto y argumentos de tools) | 87 | 23 | 23 | 2380 | 4368 |
| Respuesta visible, bytes medios | 405 | 63 | 63 | 7525 | 11786 |
| Latencia media, todos los intentos | 11075 ms | 11273 ms | 7217 ms | 86989 ms | 37242 ms |
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
