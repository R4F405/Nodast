import { mkdirSync, writeFileSync } from "node:fs";
import { demo } from "../src/demo.ts";

// Writes docs/demo.svg: the `pnpm demo` session as a terminal where lines appear one by one.
// Regenerate with `pnpm demo:svg` after changing src/demo.ts.

const LINE = 20;
const PAD = 20;
const CHAR = 8.4;
const STEP = 0.32;

function color(line: string): string {
  if (line.startsWith("#")) return "#8b949e";
  if (line.startsWith(">")) return "#79c0ff";
  if (line.trimStart().startsWith("ok")) return "#7ee787";
  if (line.trimStart().startsWith("rejected")) return "#ff7b72";
  return "#e6edf3";
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const lines = demo();
const width = Math.ceil(Math.max(...lines.map((line) => line.length)) * CHAR + PAD * 2);
const height = lines.length * LINE + PAD * 2 + 28;
const rows = lines
  .map((line, index) => {
    const y = PAD + 28 + (index + 1) * LINE - 5;
    const delay = (index * STEP).toFixed(2);
    return `<text x="${PAD}" y="${y}" fill="${color(line)}" style="animation-delay:${delay}s">${escape(line) || " "}</text>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Nodast tool session: rename, add a parameter, a refused edit">
  <style>
    text { font: 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre; opacity: 0; animation: show 0.25s ease-out forwards; }
    @keyframes show { to { opacity: 1; } }
  </style>
  <rect width="100%" height="100%" rx="8" fill="#0d1117"/>
  <circle cx="${PAD}" cy="${PAD}" r="6" fill="#ff5f56"/>
  <circle cx="${PAD + 20}" cy="${PAD}" r="6" fill="#ffbd2e"/>
  <circle cx="${PAD + 40}" cy="${PAD}" r="6" fill="#27c93f"/>
  ${rows}
</svg>
`;

mkdirSync("docs", { recursive: true });
writeFileSync("docs/demo.svg", svg);
console.log(`docs/demo.svg: ${lines.length} lines, ${width}x${height}`);
