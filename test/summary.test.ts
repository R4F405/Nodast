import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReport, render } from "../bench/summary.ts";

const full = `# Medición

Una pasada el 2026-11-05 con gpt-x (OpenAI), sin temperatura, 5 repeticiones por objetivo.

## Editar un archivo existente

### Renombrar en 40 pasos

|  | Nodast, tools | Nodast, ids por líneas | Texto, tools | Texto plano |
| --- | ---: | ---: | ---: | ---: |
| Pass@1, válido al primer intento | 5/5 (100%) | 5/5 (100%) | 1/5 (20%) | 5/5 (100%) |
| Correcto en ≤ 3 intentos (oráculo) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| \`completion_tokens\` medios, todos los intentos | 34 | 677 | 68 | 517 |
| Latencia media, todos los intentos | 2161 ms | 7297 ms | 4699 ms | 4714 ms |

## Payload

| Programa | Compacto, bytes / tokens |
| --- | ---: |
| let y suma | 19 / 10 |
`;

const old = `# Medición

Una pasada el 2026-11-01 con model-y, temperatura 0.01, 3 repeticiones por objetivo.
`;

test("summarizes each provider and marks what a pass did not measure", () => {
  const text = render([parseReport("OpenAI", "bench/openai.md", full), parseReport("MiniMax", "bench/minimax.md", old)]);
  assert.match(text, /- OpenAI, `gpt-x`, el 2026-11-05, 5 repeticiones: \[bench\/openai.md\]\(bench\/openai.md\)\.\n/);
  assert.match(text, /- MiniMax, `model-y`, el 2026-11-01, 3 repeticiones: .*Sin medir en esta pasada: Renombrar en 40 pasos\./);
  assert.match(text, /\n## Editar un archivo existente\n\n### Renombrar en 40 pasos\n/);
  assert.match(text, /\| OpenAI \| Texto, tools \| 1\/5 \(20%\) \| 5\/5 \(100%\) \| 68 \| 4699 ms \|/);
  assert.match(text, /\| MiniMax \| Nodast, tools \| sin medir \| sin medir \| sin medir \| sin medir \|/);
  assert.doesNotMatch(text, /ids por líneas|Payload/);
});
