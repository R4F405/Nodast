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
| MiniMax | Nodast | 60/60 (100%) | 59/60 (98%) | 208 | 2619 ms |
| MiniMax | Texto plano | 60/60 (100%) | 60/60 (100%) | 180 | 2586 ms |

## Editar un archivo existente

### Cadena de 50 `let`

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | `prompt_tokens`, total | Latencia |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI | Nodast, tools | 15/15 (100%) | 15/15 (100%) | 36 | 1377 | 2238 ms |
| OpenAI | Texto, tools | 15/15 (100%) | 15/15 (100%) | 48 | 822 | 2155 ms |
| OpenAI | Texto plano | 15/15 (100%) | 15/15 (100%) | 563 | 609 | 5029 ms |
| MiniMax | Nodast, tools | 12/15 (80%) | 15/15 (100%) | 344 | 6559 | 5466 ms |
| MiniMax | Texto, tools | 15/15 (100%) | 15/15 (100%) | 426 | 3061 | 11616 ms |
| MiniMax | Texto plano | 15/15 (100%) | 14/15 (93%) | 629 | 801 | 6260 ms |

### Cadena de 500 `let`

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | `prompt_tokens`, total | Latencia |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI | Nodast, tools | 15/15 (100%) | 15/15 (100%) | 61 | 772 | 4636 ms |
| OpenAI | Texto, tools | 15/15 (100%) | 15/15 (100%) | 67 | 581 | 4451 ms |
| OpenAI | Texto plano | 15/15 (100%) | 15/15 (100%) | 5513 | 5559 | 32773 ms |
| MiniMax | Nodast, tools | 14/15 (93%) | 15/15 (100%) | 1534 | 5539 | 9453 ms |
| MiniMax | Texto, tools | 15/15 (100%) | 15/15 (100%) | 657 | 5993 | 6667 ms |
| MiniMax | Texto plano | 15/15 (100%) | 15/15 (100%) | 5792 | 5751 | 32366 ms |

### Renombrar en 40 pasos

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | `prompt_tokens`, total | Latencia |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI | Nodast, tools | 5/5 (100%) | 5/5 (100%) | 34 | 1489 | 2161 ms |
| OpenAI | Texto, tools | 1/5 (20%) | 5/5 (100%) | 68 | 1618 | 4699 ms |
| OpenAI | Texto plano | 5/5 (100%) | 5/5 (100%) | 517 | 565 | 4714 ms |
| MiniMax | Nodast, tools | 5/5 (100%) | 5/5 (100%) | 1032 | 16711 | 13873 ms |
| MiniMax | Texto, tools | 1/5 (20%) | 5/5 (100%) | 1179 | 11383 | 60458 ms |
| MiniMax | Texto plano | 5/5 (100%) | 5/5 (100%) | 636 | 757 | 2481 ms |

### Renombrar en 400 pasos

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | `prompt_tokens`, total | Latencia |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI | Nodast, tools | 5/5 (100%) | 5/5 (100%) | 55 | 907 | 4370 ms |
| OpenAI | Texto, tools | 5/5 (100%) | 5/5 (100%) | 80 | 1187 | 6742 ms |
| OpenAI | Texto plano | 5/5 (100%) | 5/5 (100%) | 4927 | 4975 | 29101 ms |
| MiniMax | Nodast, tools | 5/5 (100%) | 5/5 (100%) | 1510 | 18691 | 25313 ms |
| MiniMax | Texto, tools | 0/5 (0%) | 5/5 (100%) | 2716 | 33456 | 48437 ms |
| MiniMax | Texto plano | 5/5 (100%) | 5/5 (100%) | 5285 | 5180 | 55673 ms |

### Añadir un parámetro con 20 llamadas

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | `prompt_tokens`, total | Latencia |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI | Nodast, tools | sin medir | sin medir | sin medir | sin medir | sin medir |
| OpenAI | Texto, tools | sin medir | sin medir | sin medir | sin medir | sin medir |
| OpenAI | Texto plano | sin medir | sin medir | sin medir | sin medir | sin medir |
| MiniMax | Nodast, tools | 5/5 (100%) | 5/5 (100%) | 1628 | 20613 | 10451 ms |
| MiniMax | Texto, tools | 0/5 (0%) | 5/5 (100%) | 2739 | 18921 | 37415 ms |
| MiniMax | Texto plano | 0/5 (0%) | 5/5 (100%) | 966 | 1336 | 9132 ms |

### Añadir un parámetro con 200 llamadas

| Proveedor | Variante | Pass@1 | Correcto | `completion_tokens` | `prompt_tokens`, total | Latencia |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| OpenAI | Nodast, tools | sin medir | sin medir | sin medir | sin medir | sin medir |
| OpenAI | Texto, tools | sin medir | sin medir | sin medir | sin medir | sin medir |
| OpenAI | Texto plano | sin medir | sin medir | sin medir | sin medir | sin medir |
| MiniMax | Nodast, tools | 5/5 (100%) | 5/5 (100%) | 2225 | 26138 | 40095 ms |
| MiniMax | Texto, tools | 0/5 (0%) | 5/5 (100%) | 7587 | 61211 | 45821 ms |
| MiniMax | Texto plano | 0/5 (0%) | 5/5 (100%) | 6226 | 7816 | 33743 ms |

<!-- /tablas -->

## Conclusiones

Con OpenAI, `gpt-6.1-sol`:

- Todas las variantes aciertan en todas las tareas. Lo que cambia es el coste y la latencia.
- Escribir desde cero es un empate: 23 frente a 25 `completion_tokens`, 1.9 s frente a 2.1 s.
- En una edición local, Nodast con tools no gana al agente de texto con tools. En la cadena de 500 `let` usa 772 `prompt_tokens` y 61 `completion_tokens` frente a 581 y 67, con la misma latencia. El ahorro frente al texto plano, que reescribe el archivo, viene de editar por partes, y el agente de texto también edita por partes.
- La ventaja frente al agente de texto está en renombrar. `op rename` sigue los ámbitos y lo hace en una edición. En 40 pasos el agente de texto es válido a la primera en 1 de 5 casos, frente a 5 de 5. En 400 pasos Nodast usa 907 `prompt_tokens`, 55 `completion_tokens` y 4.4 s, frente a 1187, 80 y 6.7 s. Los dos aciertan al final.
- Las variantes de ids sin tools salen caras al renombrar: en 400 pasos gastan 5641 y 8504 `completion_tokens`, más que el texto plano.

Con MiniMax, `MiniMax-M3`, en la pasada del 2026-11-19 con el bench actual (5 repeticiones, `BENCH_CONCURRENCY=4`):

- Todas las variantes aciertan al final salvo un caso de escribir desde cero con Nodast (59/60) y uno de texto plano en la cadena de 50 (14/15). La diferencia está en el acierto a la primera, el coste y la latencia.
- Escribir desde cero es casi un empate: 208 frente a 180 `completion_tokens`, 2.6 s los dos. La pasada anterior, con 827 frente a 203 y 8.5 s frente a 1.9 s, era de antes de la inferencia de tipos actual.
- En una edición local Nodast con tools no gana al agente de texto. En la cadena de 50 es más rápido (5.5 s frente a 11.6 s) pero usa el doble de `prompt_tokens` (6559 frente a 3061) y es válido a la primera en 12/15. En la de 500 pierde: 1534 `completion_tokens` y 9.5 s frente a 657 y 6.7 s.
- La ventaja está en las ediciones estructurales. Al renombrar, el agente de texto es válido a la primera en 1/5 (40 pasos) y 0/5 (400 pasos), frente a 5/5 de Nodast, y tarda 60 s y 48 s frente a 14 s y 25 s. Al añadir un parámetro, el agente de texto y el texto plano son válidos a la primera en 0/5; Nodast en 5/5. Con 200 llamadas, Nodast usa 2225 `completion_tokens` y 26138 `prompt_tokens`, frente a 7587 y 61211 del agente de texto.
- El texto plano es el más rápido al renombrar en 40 pasos (2.5 s) y al añadir un parámetro con 20 llamadas (9.1 s): el archivo es pequeño y reescribirlo sale barato. En los archivos grandes pierde: 32 s en la cadena de 500 y 56 s al renombrar en 400 pasos.
- MiniMax gasta muchos más tokens que `gpt-6.1-sol` en todas las variantes, sobre todo en razonamiento y en llamadas de más a `find` y `show`.

Añadir un parámetro con OpenAI no está todavía en [bench/openai.md](bench/openai.md). Se midió en una pasada aparte, con 5 repeticiones: con 200 llamadas, Nodast con tools usó 2182 `prompt_tokens`, 136 `completion_tokens` y 9.1 s, frente a 12045, 174 y 13.7 s del agente de texto y 7432, 5668 y 35 s del texto plano. `op param` cambia la función y todas las llamadas en una edición; el agente de texto tiene que tocar cada llamada. Entrará en las tablas con la próxima pasada de OpenAI.
