# Medición

Una pasada en esta máquina, el 2026-11-03. No es un test de regresión. `pnpm bench` vuelve a medir el motor en local. `pnpm bench -- --model` añade una llamada a MiniMax.

Rust va en `--release`. Cada celda es la mediana. El programa corto se midió 10,000 veces y el grande 40 veces, después de un calentamiento. El árbol grande es una suma equilibrada de unos, de profundidad 12.

| | |
| --- | --- |
| Sistema | win32 10.0.26300 |
| CPU | AMD Ryzen 5 5600X 6-Core Processor |
| RAM | 31.9 GB |
| Node | v22.19.0 |
| Rust | rustc 1.97.1 (8bab26f4f 2026-07-14) |

El programa corto es `(let x (add 1 2) x)`: 5 nodos, 19 bytes de texto, 97 bytes de buffer. El checker dice `number`.

| Operación | TypeScript | Rust |
| --- | ---: | ---: |
| Parsear el texto | 1.4 µs | 1.3 µs |
| Cargar el buffer | 1.4 µs | 1.1 µs |
| Checker | 0.8 µs | 0.9 µs |
| Printer | 0.7 µs | 0.7 µs |

El programa grande tiene 8,191 nodos, 32,761 bytes de texto y 146,348 bytes de buffer. El checker dice `number`. El printer emite 20,477 bytes.

| Operación | TypeScript | Rust |
| --- | ---: | ---: |
| Parsear el texto | 2179 µs | 2808 µs |
| Cargar el buffer | 1073 µs | 1649 µs |
| Checker | 705 µs | 1673 µs |
| Printer | 668 µs | 1210 µs |

## Llamada al modelo

Dos pasadas seguidas del contrato, con el objetivo «bind the sum of 1 and 2». La primera tardó 18.8 s y la segunda 13.5 s. Las dos agotaron los 3 intentos con `undefined-name` y no llegaron al printer.

## Qué dicen los números

En el programa corto todo queda alrededor de 1 µs. En el grande, cargar el buffer tarda cerca de la mitad que parsear el texto: 1.1 ms frente a 2.2 ms en TypeScript, y 1.6 ms frente a 2.8 ms en Rust. El buffer no ahorra espacio. Pesa 4.47 veces el texto, porque cada nodo guarda su id.

Este motor en Rust no adelanta a Node en ese árbol. El checker de Rust tarda 1.7 ms y el de TypeScript 0.7 ms.

El motor, incluso con 8191 nodos, está por debajo de 3 ms. Una llamada al modelo está en segundos. Acelerar el parser no mueve el círculo.
