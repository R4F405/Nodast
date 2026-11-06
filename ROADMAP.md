# Roadmap

Qué hay, qué se construye ahora y qué queda fuera hasta que el círculo cierre. Si una fase cambia de estado, se actualiza este archivo en el mismo pull request.

## Ahora

| Pieza | Estado |
| --- | --- |
| Visión y decisiones de formato | Hecho |
| Lenguaje del PoC y del motor | Hecho. Ver abajo |
| README, contribución, licencia | Hecho |
| Código del PoC | Fases 1 a 4 hechas. PoC cerrado |
| Binario | Hecho |
| Gramática del texto compacto | Hecho. MiniMax no puede aplicarla al muestrear |
| Motor en Rust | Hecho. `cargo test --manifest-path rust/Cargo.toml` |
| Medición | Hecho. Ver [BENCH.md](BENCH.md) |
| Tools `find`, `show`, `edit` | Hecho. `src/tools.ts` |

## PoC

El PoC termina cuando un pedido falso de modelo entra como texto compacto, el checker lo acepta o lo rechaza con un error útil, y el printer emite TypeScript. Sin API de pago en el camino crítico.

### 1. IR y parser

**Estado: hecho.**

Nodos del lenguaje mínimo: literales, `let`, funciones puras, llamadas, `if`, aritmética y comparación. Cada nodo tiene `id` y un tag.

- Parser del texto compacto a structs, en una pasada.
- Errores de forma con posición, para poder reintentar.
- Printer determinista a TypeScript.

### 2. Checker

**Estado: hecho.**

Sobre el árbol ya parseado:

- el árbol está bien formado
- cada nombre usado está definido
- los tipos simples cuadran: `number`, `bool` y funciones. La inferencia es Hindley-Milner: una función ligada con `let` es genérica y un tipo que nada fija queda como variable, así que `(fn (f) (f 5))` es `((number) -> a) -> a` y no un error

El checker devuelve un error estructurado, no un párrafo. Ese error es lo que volvería al modelo.

### 3. Operaciones

**Estado: hecho.**

El modelo no devuelve el programa entero cuando edita. Devuelve una lista:

- `replace` cambia cualquier nodo.
- `insert` añade un argumento a una llamada, en un índice. El id es el de la llamada.
- `delete` quita un argumento de una llamada. El id es el del argumento.

El resto de huecos son obligatorios: un `add` no pierde un hijo, se sustituye. La lista se aplica en orden sobre una copia. Si una operación falla, el árbol de entrada sigue igual.

### 4. Contrato con el modelo

**Estado: hecho.** El PoC está cerrado.

- Sin programa, la respuesta es un programa. Con programa, la respuesta es `(edits (replace id expr) (insert id index expr) (delete id))`.
- Un fixture devuelve respuestas escritas. `pnpm test` no abre la red.
- Si el checker o una operación rechaza la respuesta, el error vuelve en el siguiente intento. El tope por defecto es 3.
- El printer solo corre cuando el checker ha aceptado el árbol.
- El cliente real está en `minimax.ts` y no lo importan los tests del bucle. Ver la sección Modelo.

## Lenguaje del proyecto

Decidido el 3 de noviembre de 2026.

| Pieza | Lenguaje | Cuándo |
| --- | --- | --- |
| Parser, checker, printer, operaciones y contrato | TypeScript | Fases 1 a 4 |
| Motor, binario y recorrido del árbol | Rust | Después de cerrar la fase 4 |
| Texto que escribe el modelo | Ninguno. Es datos: `(let x (add 1 2) x)` | Siempre el mismo |
| Fuente que emite el printer | TypeScript | PoC. Otros printers, más adelante |

TypeScript es el lenguaje del PoC porque los nodos todavía se van a mover. Conviene cambiar un `kind` el mismo día en que falle un ejemplo, y el primer test de verdad es generar un archivo y pasarlo por `tsc`. En árboles pequeños el tiempo se lo lleva el modelo, no el parser.

Rust es el lenguaje del motor cuando esa cadena ya no cambie. El checker encaja en un `match` exhaustivo, el binario es el formato nativo y el recorrido es más rápido. Empezar ahí, con `let` y el cuerpo aún sin fijar, paga lifetimes y un arena de ids durante las fases 1 a 4. Al cerrar la fase 4 la reescritura es pequeña: mismos nodos, mismo texto de entrada, el de TypeScript queda como referencia de comportamiento.

## Herramientas

Decidido el 3 de noviembre de 2026.

| Pieza | Elección |
| --- | --- |
| Gestor de paquetes | pnpm 11.5, fijado en `packageManager` |
| Runtime de los tests | Node 22.18 o superior, con `node:test` |
| Comprobación de tipos | `tsc`, sin emitir JavaScript |

pnpm mantiene un `node_modules` estricto y la misma versión para quien clone el repo. El campo `packageManager` es la fuente de esa versión.

## Modelo

Decidido el 3 de noviembre de 2026.

Las llamadas reales van a MiniMax, con el plan de tokens ya contratado. Se puede gastar con holgura cuando un experimento lo necesite: probar el bucle, medir reintentos, comparar prompts. No es un presupuesto para vaciar el plan.

| Qué | Dónde corre |
| --- | --- |
| Tests, fixtures y `pnpm test` | En local, sin red y sin clave |
| Probar el contrato contra un modelo de verdad | MiniMax |
| Medición principal, `BENCH.md` | OpenAI, `gpt-6.1-sol`. MiniMax queda en `bench/minimax.md` |

La clave se lee de `MINIMAX_API_KEY` y no entra en el repositorio. El cliente usa el endpoint compatible con OpenAI, `https://api.minimax.io/v1/chat/completions`. El modelo por defecto es `MiniMax-M3.1-Flash`, con `reasoning_effort: low`, para no gastar el plan en razonamiento sobre una gramática corta. `MINIMAX_MODEL` y `MINIMAX_BASE_URL` lo cambian. El ejemplo está en `.env.example`.

## Después del PoC

En este orden, salvo que una medición diga lo contrario:

1. **Binario.** **Estado: hecho.** El árbol se aplana a un buffer little-endian (`NDS1`, versión 1) y se vuelve a cargar sin parsear el texto. `encode` no comprueba tipos: el checker va antes. El motor en Rust leerá este mismo buffer.
2. **Gramática en el decodificador.** **Estado: hecho en local.** `grammar` dice si un programa o una lista `(edits ...)` ya puede cerrarse, y `allows` dice si el carácter siguiente seguiría siendo válido. MiniMax-M3.1-Flash no enmascara el muestreo: su API no acepta una gramática ni `response_format`. El cliente no envía un parámetro que el modelo ignoraría. La máscara queda lista para un runtime que sí pueda usarla.
3. **Motor en Rust.** **Estado: hecho.** Vive en `rust/` y repite el árbol, el parser, el checker, el printer, las operaciones y el binario. Se prueba con `cargo test --manifest-path rust/Cargo.toml`. TypeScript del PoC sigue siendo la referencia de comportamiento.
4. **Medición.** **Estado: hecho** el 3 de noviembre de 2026. [BENCH.md](BENCH.md) compara Pass@1, payload, edición y reintentos contra texto plano. En esa pasada el texto plano acertó a la primera y Nodast no; el buffer pesa más que el fuente; la edición local queda por debajo de 0.01 ms y reescribir el archivo con el modelo tardó 787 ms. La velocidad del motor está en [bench/engine.md](bench/engine.md).
5. **Tools.** **Estado: hecho** el 5 de noviembre de 2026. El modelo trabaja sobre una sesión con `find`, `show` y `edit` en vez de leer el árbol entero. Un programa de hasta 256 nodos va entero en el prompt; uno mayor, solo como resumen. `edit` responde con el trozo ya cambiado, acepta `done` para cerrar sin otra llamada y nunca da a un nodo nuevo un id que el modelo ya vio. En la pasada del 5 de noviembre, con 5 repeticiones, acertó 15/15 en cadenas de 50 y de 500 `let`; en la de 500 usó 3231 `prompt_tokens` y 300 `completion_tokens` por edición, frente a 5749 y 5851 del texto plano. Con `gpt-6.1-sol` de OpenAI ([BENCH.md](BENCH.md)), las cuatro variantes de edición aciertan 15/15 a la primera en los dos tamaños; en la cadena de 500 las tools usan 2 llamadas, 1122 `prompt_tokens` y 57 `completion_tokens`, frente a 5559 y 5513 del texto plano, y tardan 4.5 s frente a 36 s. Frente a un agente de texto con `grep`, `read` y `replace`, la ventaja desaparece: en la cadena de 500 ese agente usa 585 `prompt_tokens` y 63 `completion_tokens`, con la misma latencia y el mismo acierto. El ahorro viene de editar por partes, no del formato. Con el prompt reducido a una línea de gramática y `edit` con campos sueltos, Nodast baja a 772 `prompt_tokens` frente a 581, casi empatado. Al renombrar `rate` a `scale` junto a `rate_cap`, Nodast gana: `rename` sigue los ámbitos y lo hace en una sola edición, y en 400 pasos usa 907 `prompt_tokens`, 55 `completion_tokens` y 4.1 s frente a 2613, 130 y 11.6 s del texto con tools, que suele reemplazar `rate` en todo el archivo, romper `rate_cap` y arreglarlo después. Al añadir un parámetro a una función llamada en 200 sitios, `op param` cambia la función y todas las llamadas a la vez: 2182 `prompt_tokens`, 136 `completion_tokens` y 9.1 s, frente a 12045, 174 y 13.7 s del texto con tools, que tiene que tocar cada llamada. Esa pasada se hizo aparte, con 5 repeticiones, y no está todavía en [BENCH.md](BENCH.md).
6. **Más printers.** Otro lenguaje de salida leyendo la misma IR. Solo cuando el printer de TypeScript lleve un tiempo estable.
7. **Evaluador.** Ejecutar el árbol validado sin pasar por el fuente, si hace falta para tests o para un runtime.

## Fuera de alcance

Hasta nuevo aviso, no entran en el repositorio:

- un AST de TypeScript, Babel o Rust como IR
- JSON como formato hacia el modelo
- hexadecimal como formato del programa
- varios lenguajes de salida a la vez
- bytecode como objetivo del PoC
- editor, LSP o extensión
- llamada real a un proveedor dentro de los tests. Fuera de los tests, el proveedor es MiniMax u OpenAI

## Cómo se lee el estado

| Marca | Significado |
| --- | --- |
| Hecho | Está en el repositorio y se puede usar |
| En curso | Hay una rama o un pull request abierto |
| Pendiente | Acordado, sin código |
| Fuera | No se hace en esta etapa |
