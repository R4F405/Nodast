import { mkdirSync, writeFileSync } from "node:fs";
import { demo } from "../src/demo.ts";

// Writes docs/demo.svg (dark) and docs/demo-light.svg: the `pnpm demo` session as a terminal where lines
// appear one by one. The README picks one with <picture> and prefers-color-scheme, so it matches GitHub's theme.
// Lines are visible by default and only fade in where CSS animation runs, so a viewer without it still shows
// the whole session. Regenerate with `pnpm demo:svg` after changing src/demo.ts.

type Theme = {
  bg: string;
  bar: string;
  border: string;
  title: string;
  comment: string;
  call: string;
  ok: string;
  rejected: string;
  text: string;
  changed: string;
};

const DARK: Theme = {
  bg: "#0d1117",
  bar: "#161b22",
  border: "#30363d",
  title: "#8b949e",
  comment: "#8b949e",
  call: "#79c0ff",
  ok: "#7ee787",
  rejected: "#ff7b72",
  text: "#e6edf3",
  changed: "rgba(46,160,67,0.18)",
};

const LIGHT: Theme = {
  bg: "#ffffff",
  bar: "#f6f8fa",
  border: "#d0d7de",
  title: "#57606a",
  comment: "#6e7781",
  call: "#0969da",
  ok: "#1a7f37",
  rejected: "#cf222e",
  text: "#1f2328",
  changed: "rgba(26,127,55,0.12)",
};

const LINE = 20;
const PAD = 20;
const BAR = 36;
const CHAR = 8.4;
const STEP = 0.3;
const FIRST = "# A program, as TypeScript";
const FINAL = "# The same program, printed again";

function color(line: string, theme: Theme): string {
  if (line.startsWith("$")) return theme.text;
  if (line.startsWith("#")) return theme.comment;
  if (line.startsWith(">")) return theme.call;
  if (line.trimStart().startsWith("ok")) return theme.ok;
  if (line.trimStart().startsWith("rejected")) return theme.rejected;
  return theme.text;
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Lines of the final program that differ from the first one get a diff-style band, so the eye lands on
// what the edits changed and on what they left alone (rate_cap).
function changedLines(lines: readonly string[]): Set<number> {
  const begin = lines.indexOf(FIRST);
  const start = lines.indexOf(FINAL);
  const changed = new Set<number>();
  if (begin === -1 || start === -1) return changed;
  const first = new Set<string>();
  for (let index = begin + 1; index < lines.length && lines[index] !== ""; index += 1) first.add(lines[index] ?? "");
  for (let index = start + 1; index < lines.length; index += 1) {
    if (!first.has(lines[index] ?? "")) changed.add(index);
  }
  return changed;
}

function render(lines: readonly string[], theme: Theme): string {
  const width = Math.ceil((Math.max(...lines.map((line) => line.length)) + 2) * CHAR + PAD * 2);
  const height = BAR + PAD + lines.length * LINE + PAD - 4;
  const changed = changedLines(lines);
  const rows = lines.flatMap((line, index) => {
    const top = BAR + PAD + index * LINE - 4;
    const delay = (index * STEP).toFixed(2);
    const style = `class="row" style="animation-delay:${delay}s"`;
    const text = `<text x="${PAD}" y="${top + LINE - 5}" fill="${color(line, theme)}" ${style}>${escape(line) || " "}</text>`;
    if (!changed.has(index)) return [text];
    const band = `<rect x="${PAD - 8}" y="${top}" width="${width - PAD * 2 + 16}" height="${LINE}" rx="3" fill="${theme.changed}" ${style}/>`;
    return [band, text];
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title">
  <title id="title">Nodast tool session: a scoped rename, a parameter added at every call, and an edit the checker refuses</title>
  <style>
    text { font: 14px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; white-space: pre; }
    .row { animation: show 0.25s ease-out backwards; }
    @keyframes show { from { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .row { animation: none; } }
    .bar { font: 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  </style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" fill="${theme.bg}" stroke="${theme.border}"/>
  <path d="M0.5 ${BAR} V8.5 A8 8 0 0 1 8.5 0.5 H${width - 8.5} A8 8 0 0 1 ${width - 0.5} 8.5 V${BAR} Z" fill="${theme.bar}" stroke="${theme.border}"/>
  <circle cx="${PAD}" cy="${BAR / 2}" r="6" fill="#ff5f56"/>
  <circle cx="${PAD + 20}" cy="${BAR / 2}" r="6" fill="#ffbd2e"/>
  <circle cx="${PAD + 40}" cy="${BAR / 2}" r="6" fill="#27c93f"/>
  <text class="bar" x="${width / 2}" y="${BAR / 2 + 4}" fill="${theme.title}" text-anchor="middle">nodast: offline tool session, no model, no key</text>
  ${rows.join("\n  ")}
</svg>
`;
}

const lines = ["$ pnpm demo", ...demo()];
mkdirSync("docs", { recursive: true });
writeFileSync("docs/demo.svg", render(lines, DARK));
writeFileSync("docs/demo-light.svg", render(lines, LIGHT));
console.log(`docs/demo.svg and docs/demo-light.svg: ${lines.length} lines`);
