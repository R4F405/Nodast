# Medición

Resumen de las pasadas del bench con OpenAI y con MiniMax. El modelo escribe programas pequeños desde cero y edita un archivo existente: cambia una constante o una suma en una cadena de 50 y de 500 `let`, y renombra `rate` a `scale` junto a `rate_cap` en 40 y en 400 pasos. Cada edición se hace de tres formas: Nodast con sus tools `find`, `show` y `edit`; un agente de texto sobre el mismo TypeScript, con `grep`, `read` y `replace`, como los agentes de código de hoy; y texto plano, donde el modelo devuelve el archivo entero. Escribir desde cero no usa tools: Nodast escribe el árbol compacto y el texto plano escribe TypeScript. Las tareas son sintéticas y aíslan un tipo de edición cada una.

Los informes completos, con las variantes de ids sin tools, todas las métricas y cada objetivo, están en [bench/openai.md](bench/openai.md) y [bench/minimax.md](bench/minimax.md). La velocidad del motor, sin modelo, está en [bench/engine.md](bench/engine.md).

Pass@1: válido al primer intento. Correcto: el oráculo acepta el resultado en ≤ 3 intentos. `completion_tokens`, `prompt_tokens` y latencia son medias por tarea, con todas las llamadas; `completion_tokens` incluye el razonamiento del modelo. "Sin medir" quiere decir que esa pasada no tenía la variante o la tarea.

Las tablas, entre los dos comentarios, las rehace `pnpm bench:summary` a partir de los dos informes; `pnpm bench` lo hace al terminar. Las conclusiones están escritas a mano y hay que revisarlas después de cada pasada.

<!-- tablas: las rehace pnpm bench:summary -->

Pasadas:

- OpenAI, `gpt-6.1-sol`, el 2026-11-05, 5 repeticiones: [bench/openai.md](bench/openai.md).
- MiniMax, `MiniMax-M3`, el 2026-11-05, 5 repeticiones: [bench/minimax.md](bench/minimax.md). Sin medir en esta pasada: Texto, tools; Renombrar en 40 pasos; Renombrar en 400 pasos.

## Escribir desde cero

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | Latencia |
| --- | --- | ---: | ---: | ---: | ---: |
| OpenAI | Nodast | 60/60 (100%) | 60/60 (100%) | 23 | 1931 ms |
| OpenAI | Texto plano | 60/60 (100%) | 60/60 (100%) | 25 | 2116 ms |
| MiniMax | Nodast | 54/60 (90%) | 60/60 (100%) | 827 | 8542 ms |
| MiniMax | Texto plano | 60/60 (100%) | 60/60 (100%) | 203 | 1928 ms |

## Editar un archivo existente

### Cadena de 50 `let`

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | `prompt_tokens`, total | Latencia |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI | Nodast, tools | 15/15 (100%) | 15/15 (100%) | 36 | 1377 | 2238 ms |
| OpenAI | Texto, tools | 15/15 (100%) | 15/15 (100%) | 48 | 822 | 2155 ms |
| OpenAI | Texto plano | 15/15 (100%) | 15/15 (100%) | 563 | 609 | 5029 ms |
| MiniMax | Nodast, tools | 12/15 (80%) | 15/15 (100%) | 288 | 3941 | 3406 ms |
| MiniMax | Texto, tools | sin medir | sin medir | sin medir | sin medir | sin medir |
| MiniMax | Texto plano | 15/15 (100%) | 14/15 (93%) | 642 | 801 | 2570 ms |

### Cadena de 500 `let`

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | `prompt_tokens`, total | Latencia |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI | Nodast, tools | 15/15 (100%) | 15/15 (100%) | 61 | 772 | 4636 ms |
| OpenAI | Texto, tools | 15/15 (100%) | 15/15 (100%) | 67 | 581 | 4451 ms |
| OpenAI | Texto plano | 15/15 (100%) | 15/15 (100%) | 5513 | 5559 | 32773 ms |
| MiniMax | Nodast, tools | 12/15 (80%) | 15/15 (100%) | 300 | 3231 | 4346 ms |
| MiniMax | Texto, tools | sin medir | sin medir | sin medir | sin medir | sin medir |
| MiniMax | Texto plano | 15/15 (100%) | 15/15 (100%) | 5851 | 5749 | 21573 ms |

### Renombrar en 40 pasos

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | `prompt_tokens`, total | Latencia |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI | Nodast, tools | 5/5 (100%) | 5/5 (100%) | 34 | 1489 | 2161 ms |
| OpenAI | Texto, tools | 1/5 (20%) | 5/5 (100%) | 68 | 1618 | 4699 ms |
| OpenAI | Texto plano | 5/5 (100%) | 5/5 (100%) | 517 | 565 | 4714 ms |
| MiniMax | Nodast, tools | sin medir | sin medir | sin medir | sin medir | sin medir |
| MiniMax | Texto, tools | sin medir | sin medir | sin medir | sin medir | sin medir |
| MiniMax | Texto plano | sin medir | sin medir | sin medir | sin medir | sin medir |

### Renombrar en 400 pasos

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | `prompt_tokens`, total | Latencia |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI | Nodast, tools | 5/5 (100%) | 5/5 (100%) | 55 | 907 | 4370 ms |
| OpenAI | Texto, tools | 5/5 (100%) | 5/5 (100%) | 80 | 1187 | 6742 ms |
| OpenAI | Texto plano | 5/5 (100%) | 5/5 (100%) | 4927 | 4975 | 29101 ms |
| MiniMax | Nodast, tools | sin medir | sin medir | sin medir | sin medir | sin medir |
| MiniMax | Texto, tools | sin medir | sin medir | sin medir | sin medir | sin medir |
| MiniMax | Texto plano | sin medir | sin medir | sin medir | sin medir | sin medir |

<!-- /tablas -->

## Conclusiones

Con OpenAI, `gpt-6.1-sol`:

- Todas las variantes aciertan en todas las tareas. Lo que cambia es el coste y la latencia.
- Escribir desde cero es un empate: 23 frente a 25 `completion_tokens`, 1.9 s frente a 2.1 s.
- En una edición local, Nodast con tools no gana al agente de texto con tools. En la cadena de 500 `let` usa 772 `prompt_tokens` y 61 `completion_tokens` frente a 581 y 67, con la misma latencia. El ahorro frente al texto plano, que reescribe el archivo, viene de editar por partes, y el agente de texto también edita por partes.
- La ventaja frente al agente de texto está en renombrar. `op rename` sigue los ámbitos y lo hace en una edición. En 40 pasos el agente de texto es válido a la primera en 1 de 5 casos, frente a 5 de 5. En 400 pasos Nodast usa 907 `prompt_tokens`, 55 `completion_tokens` y 4.4 s, frente a 1187, 80 y 6.7 s. Los dos aciertan al final.
- Las variantes de ids sin tools salen caras al renombrar: en 400 pasos gastan 5641 y 8504 `completion_tokens`, más que el texto plano.

Con MiniMax, la pasada en disco usó `MiniMax-M3` y es anterior al agente de texto con tools y a las tareas de renombrar y de añadir un parámetro:

- Escribir desde cero fue peor con Nodast: 54/60 válido a la primera frente a 60/60, 827 `completion_tokens` frente a 203 y 8.5 s frente a 1.9 s. Los dos acertaron 60/60 al final.
- Al editar, Nodast con tools acertó 15/15 en los dos tamaños, frente a 14/15 y 15/15 del texto plano, pero fue válido a la primera en 12/15, frente a 15/15. En la cadena de 500 usó 300 `completion_tokens` y 4.3 s, frente a 5851 y 21.6 s.
- Sin el agente de texto con tools todavía no hay comparación justa con MiniMax. La da la pasada nueva, `BENCH_PROVIDER=minimax pnpm bench`.

Añadir un parámetro a una función llamada en 20 y en 200 sitios está en el bench (`BENCH_PARAM`), pero no en ninguno de los dos informes. Con OpenAI se midió en una pasada aparte, con 5 repeticiones: con 200 llamadas, Nodast con tools usó 2182 `prompt_tokens`, 136 `completion_tokens` y 9.1 s, frente a 12045, 174 y 13.7 s del agente de texto y 7432, 5668 y 35 s del texto plano. `op param` cambia la función y todas las llamadas en una edición; el agente de texto tiene que tocar cada llamada. Entrará en las tablas con la próxima pasada de cada proveedor.
