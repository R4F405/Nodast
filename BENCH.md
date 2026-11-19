# Medición

Resumen de las pasadas del bench con OpenAI y con MiniMax. El modelo escribe programas pequeños desde cero y edita un archivo existente: cambia una constante o una suma en una cadena de 50 y de 500 `let`, renombra `rate` a `scale` junto a `rate_cap` en 40 y en 400 pasos, y añade un parámetro a una función llamada en 20 y en 200 sitios. Cada edición se hace de tres formas: Nodast con sus tools `find`, `show` y `edit`; un agente de texto sobre el mismo TypeScript, con `grep`, `read` y `replace`, como los agentes de código de hoy; y texto plano, donde el modelo devuelve el archivo entero. Escribir desde cero no usa tools: Nodast escribe el árbol compacto y el texto plano escribe TypeScript. Las tareas son sintéticas y aíslan un tipo de edición cada una.

Los informes completos, con las variantes de ids sin tools, todas las métricas y cada objetivo, están en [bench/openai.md](bench/openai.md) y [bench/minimax.md](bench/minimax.md). La velocidad del motor, sin modelo, está en [bench/engine.md](bench/engine.md).

Pass@1: válido al primer intento. Correcto: el oráculo acepta el resultado en ≤ 3 intentos. `completion_tokens`, `prompt_tokens` y latencia son medias por tarea, con todas las llamadas; `completion_tokens` incluye el razonamiento del modelo. "Sin medir" quiere decir que esa pasada no tenía la variante o la tarea.

Las tablas, entre los dos comentarios, las rehace `pnpm bench:summary` a partir de los dos informes; `pnpm bench` lo hace al terminar. Las conclusiones están escritas a mano y hay que revisarlas después de cada pasada.

<!-- tablas: las rehace pnpm bench:summary -->

Pasadas:

- OpenAI, `gpt-6.1-sol`, el 2026-11-05, 5 repeticiones: [bench/openai.md](bench/openai.md). Sin medir en esta pasada: Añadir un parámetro con 20 llamadas; Añadir un parámetro con 200 llamadas.
- MiniMax, `MiniMax-M3`, el 2026-11-19, 5 repeticiones: [bench/minimax.md](bench/minimax.md).

## Escribir desde cero

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | Latencia |
| --- | --- | ---: | ---: | ---: | ---: |
| OpenAI | Nodast | 60/60 (100%) | 60/60 (100%) | 23 | 1931 ms |
| OpenAI | Texto plano | 60/60 (100%) | 60/60 (100%) | 25 | 2116 ms |
| MiniMax | Nodast | 60/60 (100%) | 60/60 (100%) | 104 | 1568 ms |
| MiniMax | Texto plano | 60/60 (100%) | 57/60 (95%) | 195 | 3509 ms |

## Editar un archivo existente

### Cadena de 50 `let`

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | `prompt_tokens`, total | Latencia |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI | Nodast, tools | 15/15 (100%) | 15/15 (100%) | 36 | 1377 | 2238 ms |
| OpenAI | Texto, tools | 15/15 (100%) | 15/15 (100%) | 48 | 822 | 2155 ms |
| OpenAI | Texto plano | 15/15 (100%) | 15/15 (100%) | 563 | 609 | 5029 ms |
| MiniMax | Nodast, tools | 15/15 (100%) | 15/15 (100%) | 222 | 3602 | 3534 ms |
| MiniMax | Texto, tools | 10/15 (67%) | 15/15 (100%) | 467 | 2755 | 4164 ms |
| MiniMax | Texto plano | 15/15 (100%) | 15/15 (100%) | 633 | 809 | 4070 ms |

### Cadena de 500 `let`

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | `prompt_tokens`, total | Latencia |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI | Nodast, tools | 15/15 (100%) | 15/15 (100%) | 61 | 772 | 4636 ms |
| OpenAI | Texto, tools | 15/15 (100%) | 15/15 (100%) | 67 | 581 | 4451 ms |
| OpenAI | Texto plano | 15/15 (100%) | 15/15 (100%) | 5513 | 5559 | 32773 ms |
| MiniMax | Nodast, tools | 15/15 (100%) | 15/15 (100%) | 252 | 3410 | 3594 ms |
| MiniMax | Texto, tools | 15/15 (100%) | 15/15 (100%) | 381 | 5471 | 6649 ms |
| MiniMax | Texto plano | 15/15 (100%) | 14/15 (93%) | 5746 | 5759 | 33507 ms |

### Renombrar en 40 pasos

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | `prompt_tokens`, total | Latencia |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI | Nodast, tools | 5/5 (100%) | 5/5 (100%) | 34 | 1489 | 2161 ms |
| OpenAI | Texto, tools | 1/5 (20%) | 5/5 (100%) | 68 | 1618 | 4699 ms |
| OpenAI | Texto plano | 5/5 (100%) | 5/5 (100%) | 517 | 565 | 4714 ms |
| MiniMax | Nodast, tools | 4/5 (80%) | 5/5 (100%) | 603 | 9539 | 14300 ms |
| MiniMax | Texto, tools | 1/5 (20%) | 5/5 (100%) | 681 | 3108 | 16078 ms |
| MiniMax | Texto plano | 5/5 (100%) | 5/5 (100%) | 603 | 766 | 5541 ms |

### Renombrar en 400 pasos

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | `prompt_tokens`, total | Latencia |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI | Nodast, tools | 5/5 (100%) | 5/5 (100%) | 55 | 907 | 4370 ms |
| OpenAI | Texto, tools | 5/5 (100%) | 5/5 (100%) | 80 | 1187 | 6742 ms |
| OpenAI | Texto plano | 5/5 (100%) | 5/5 (100%) | 4927 | 4975 | 29101 ms |
| MiniMax | Nodast, tools | 5/5 (100%) | 5/5 (100%) | 955 | 12406 | 15615 ms |
| MiniMax | Texto, tools | 2/5 (40%) | 5/5 (100%) | 1900 | 27147 | 16641 ms |
| MiniMax | Texto plano | 5/5 (100%) | 5/5 (100%) | 5326 | 5175 | 20539 ms |

### Añadir un parámetro con 20 llamadas

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | `prompt_tokens`, total | Latencia |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI | Nodast, tools | sin medir | sin medir | sin medir | sin medir | sin medir |
| OpenAI | Texto, tools | sin medir | sin medir | sin medir | sin medir | sin medir |
| OpenAI | Texto plano | sin medir | sin medir | sin medir | sin medir | sin medir |
| MiniMax | Nodast, tools | 5/5 (100%) | 5/5 (100%) | 1006 | 14561 | 19693 ms |
| MiniMax | Texto, tools | 0/5 (0%) | 5/5 (100%) | 1879 | 5994 | 10809 ms |
| MiniMax | Texto plano | 1/5 (20%) | 5/5 (100%) | 764 | 1183 | 6018 ms |

### Añadir un parámetro con 200 llamadas

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | `prompt_tokens`, total | Latencia |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI | Nodast, tools | sin medir | sin medir | sin medir | sin medir | sin medir |
| OpenAI | Texto, tools | sin medir | sin medir | sin medir | sin medir | sin medir |
| OpenAI | Texto plano | sin medir | sin medir | sin medir | sin medir | sin medir |
| MiniMax | Nodast, tools | 5/5 (100%) | 5/5 (100%) | 966 | 10037 | 11075 ms |
| MiniMax | Texto, tools | 0/5 (0%) | 5/5 (100%) | 7259 | 65947 | 86989 ms |
| MiniMax | Texto plano | 1/5 (20%) | 5/5 (100%) | 5528 | 6763 | 37242 ms |

<!-- /tablas -->

## Conclusiones

Con OpenAI, `gpt-6.1-sol`:

- Todas las variantes aciertan en todas las tareas. Lo que cambia es el coste y la latencia.
- Escribir desde cero es un empate: 23 frente a 25 `completion_tokens`, 1.9 s frente a 2.1 s.
- En una edición local, Nodast con tools no gana al agente de texto con tools. En la cadena de 500 `let` usa 772 `prompt_tokens` y 61 `completion_tokens` frente a 581 y 67, con la misma latencia. El ahorro frente al texto plano, que reescribe el archivo, viene de editar por partes, y el agente de texto también edita por partes.
- La ventaja frente al agente de texto está en renombrar. `op rename` sigue los ámbitos y lo hace en una edición. En 40 pasos el agente de texto es válido a la primera en 1 de 5 casos, frente a 5 de 5. En 400 pasos Nodast usa 907 `prompt_tokens`, 55 `completion_tokens` y 4.4 s, frente a 1187, 80 y 6.7 s. Los dos aciertan al final.
- Las variantes de ids sin tools salen caras al renombrar: en 400 pasos gastan 5641 y 8504 `completion_tokens`, más que el texto plano.

Con MiniMax, `MiniMax-M3`, en la pasada del 2026-11-19 con el código actual (5 repeticiones, `BENCH_CONCURRENCY=4`). Esta pasada ya tiene `rename` y `param` en `(edits ...)`, tools más directas y las instrucciones fijas en un mensaje de sistema para todas las variantes; la anterior del mismo día, sin esos cambios, está en el commit `474e4a2`:

- Todas las variantes aciertan al final salvo el texto plano al escribir desde cero (57/60) y en la cadena de 500 (14/15). La diferencia está en el acierto a la primera, el coste y la latencia.
- Escribir desde cero es mejor con Nodast: 104 frente a 195 `completion_tokens` y 1.6 s frente a 3.5 s. Antes de los cambios era un empate (208 frente a 180).
- En la cadena de 500 `let`, Nodast con tools gana al agente de texto en todo: 252 `completion_tokens`, 3410 `prompt_tokens` y 3.6 s, frente a 381, 5471 y 6.6 s. Antes perdía: 1534 `completion_tokens` y 9.5 s.
- En la cadena de 50 es un empate: Nodast con tools usa menos `completion_tokens` (222 frente a 467) y más `prompt_tokens` (3602 frente a 2755). La variante de ids por líneas es la mejor a ese tamaño: 147 `completion_tokens`, 1638 `prompt_tokens`, 1 llamada y 2.0 s.
- Al renombrar y al añadir un parámetro, Nodast es válido a la primera en 24 de 25 casos con tools; el agente de texto, en 3 de 20. Con 400 pasos y con 200 llamadas, Nodast con tools gana también en coste: 12406 y 10037 `prompt_tokens` frente a 27147 y 65947.
- Con 40 pasos y con 20 llamadas, Nodast con tools usa más `prompt_tokens` que el agente de texto (9539 y 14561 frente a 3108 y 5994): MiniMax sigue comprobando con `find` y `show` ediciones ya aceptadas. Ahí la mejor variante es la de ids, que ahora tiene `rename` y `param`: una llamada, 140 y 921 `completion_tokens`, 1746 y 1189 `prompt_tokens`, todo correcto (ver [bench/minimax.md](bench/minimax.md)).
- El texto plano sigue siendo rápido en archivos pequeños (5.5 s al renombrar en 40 pasos, 6.0 s al añadir un parámetro con 20 llamadas) y lento en los grandes (34 s en la cadena de 500).
- Las latencias de esta pasada tienen ruido: compartió cuenta con otra pasada a la vez y algunas llamadas tardaron 60–100 s en el servidor. Los tokens y las llamadas son más fiables.

La pasada de OpenAI en disco es del 2026-11-05, anterior a estos cambios. Hay que repetirla para comparar con el mismo código.

Añadir un parámetro con OpenAI no está todavía en [bench/openai.md](bench/openai.md). Se midió en una pasada aparte, con 5 repeticiones: con 200 llamadas, Nodast con tools usó 2182 `prompt_tokens`, 136 `completion_tokens` y 9.1 s, frente a 12045, 174 y 13.7 s del agente de texto y 7432, 5668 y 35 s del texto plano. `op param` cambia la función y todas las llamadas en una edición; el agente de texto tiene que tocar cada llamada. Entrará en las tablas con la próxima pasada de OpenAI.
