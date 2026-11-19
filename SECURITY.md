# Security

[English](#english) · [Español](#español)

## English

If you find a security problem, do not open a public issue. Report it privately from [Security → Report a vulnerability](https://github.com/R4F405/Nodast/security/advisories/new).

Include the input that triggers it, what happens and what you expected. You will get an answer within a few days.

In scope, for example:

- an input that makes the parser, the checker or the printer hang the process or exhaust memory
- a program the checker accepts whose printed TypeScript does something different from what the tree says
- a way for a model's output in the benchmark to escape the `node:vm` sandbox

API keys go in `.env`, which is not committed. If you see a key committed by mistake, report it the same way.

## Español

Si encuentras un fallo de seguridad, no abras una issue pública. Avisa en privado desde [Security → Report a vulnerability](https://github.com/R4F405/Nodast/security/advisories/new).

Incluye la entrada que lo provoca, qué pasa y qué esperabas. La respuesta llega en unos días.

Entra en alcance, por ejemplo:

- una entrada que hace que el parser, el checker o el printer cuelguen el proceso o agoten memoria
- un programa aceptado por el checker cuyo TypeScript impreso hace algo distinto de lo que dice el árbol
- una forma de que la salida de un modelo en el bench escape del sandbox de `node:vm`

Las claves de API van en `.env`, que no entra en el repositorio. Si ves una clave subida por error, avisa por la misma vía.
