# Seguridad

Si encuentras un fallo de seguridad, no abras una issue pública. Avisa en privado desde [Security → Report a vulnerability](https://github.com/R4F405/Nodast/security/advisories/new).

Incluye la entrada que lo provoca, qué pasa y qué esperabas. La respuesta llega en unos días.

Entra en alcance, por ejemplo:

- una entrada que hace que el parser, el checker o el printer cuelguen el proceso o agoten memoria
- un programa aceptado por el checker cuyo TypeScript impreso hace algo distinto de lo que dice el árbol
- una forma de que la salida de un modelo en el bench escape del sandbox de `node:vm`

Las claves de API van en `.env`, que no entra en el repositorio. Si ves una clave subida por error, avisa por la misma vía.
