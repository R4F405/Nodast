import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Rebuilds the tables of BENCH.md from the full report of each provider. Only the text between the two
// markers changes; the intro and the conclusions above and below them stay as written.

export const START = "<!-- tablas: las rehace pnpm bench:summary -->";
export const END = "<!-- /tablas -->";

export const REPORTS = [
  { label: "OpenAI", path: "bench/openai.md" },
  { label: "MiniMax", path: "bench/minimax.md" },
] as const;

const VARIANTS = ["Nodast", "Nodast, tools", "Texto, tools", "Texto plano"];

const METRICS = [
  { head: "Pass@1", row: "Pass@1" },
  { head: "Correcto", row: "Correcto en" },
  { head: "`completion_tokens`", row: "`completion_tokens` medios" },
  { head: "`prompt_tokens`, total", row: "`prompt_tokens` totales" },
  { head: "Latencia", row: "Latencia media" },
];

const MISSING = "sin medir";

type Table = { columns: string[]; rows: Map<string, string[]> };

type Section = { group: string; title: string; table: Table };

export type Report = { label: string; path: string; model: string; date: string; runs: string; sections: Section[] };

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

// The first table under each heading whose header starts with an empty cell: the summary of a task.
export function parseReport(label: string, path: string, text: string): Report {
  const lines = text.split(/\r?\n/);
  const pass = lines.find((line) => line.startsWith("Una pasada el ")) ?? "";
  const head = /^Una pasada el (\S+) con ([^\s,(]+)/.exec(pass);
  const runs = /(\d+) repeticiones/.exec(pass);
  const sections: Section[] = [];
  let group = "";
  let title = "";
  let taken = true;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.startsWith("## ")) {
      group = line.slice(3).trim();
      title = group;
      taken = false;
      continue;
    }
    if (line.startsWith("### ")) {
      title = line.slice(4).trim();
      taken = false;
      continue;
    }
    if (taken || !line.startsWith("|")) continue;
    taken = true;
    const header = cells(line);
    if (header[0] !== "") continue;
    const rows = new Map<string, string[]>();
    for (let next = index + 2; next < lines.length && (lines[next] ?? "").startsWith("|"); next += 1) {
      const row = cells(lines[next] ?? "");
      rows.set(row[0] ?? "", row.slice(1));
    }
    sections.push({ group, title, table: { columns: header.slice(1), rows } });
  }
  return { label, path, model: head?.[2] ?? "?", date: head?.[1] ?? "?", runs: runs?.[1] ?? "?", sections };
}

function value(section: Section | undefined, variant: string, metric: string): string {
  if (section === undefined) return MISSING;
  const column = section.table.columns.indexOf(variant);
  if (column < 0) return MISSING;
  for (const [label, row] of section.table.rows) if (label.startsWith(metric)) return row[column] ?? MISSING;
  return MISSING;
}

function table(header: string[], rows: string[][]): string {
  const align = header.map((_, index) => (index < 2 ? "---" : "---:"));
  return [`| ${header.join(" | ")} |`, `| ${align.join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

export function render(reports: readonly Report[]): string {
  const order: { group: string; title: string }[] = [];
  for (const report of reports) {
    for (const section of report.sections) {
      if (!order.some((item) => item.title === section.title)) order.push({ group: section.group, title: section.title });
    }
  }
  const find = (report: Report, title: string): Section | undefined => report.sections.find((section) => section.title === title);
  const allVariants = VARIANTS.filter((variant) => reports.some((report) => report.sections.some((s) => s.table.columns.includes(variant))));
  const out: string[] = ["Pasadas:", ""];
  for (const report of reports) {
    const gaps = [
      // A variant counts as missing only in tasks this pass did measure; a missing task is listed once.
      ...allVariants.filter(
        (variant) =>
          !report.sections.some((s) => s.table.columns.includes(variant)) &&
          report.sections.some((mine) => reports.some((other) => find(other, mine.title)?.table.columns.includes(variant))),
      ),
      ...order.filter((item) => find(report, item.title) === undefined).map((item) => item.title),
    ];
    const note = gaps.length === 0 ? "" : ` Sin medir en esta pasada: ${gaps.join("; ")}.`;
    out.push(`- ${report.label}, \`${report.model}\`, el ${report.date}, ${report.runs} repeticiones: [${report.path}](${report.path}).${note}`);
  }
  let group = "";
  for (const item of order) {
    const sections = reports.map((report) => find(report, item.title));
    const variants = VARIANTS.filter((variant) => sections.some((s) => s?.table.columns.includes(variant)));
    const metrics = METRICS.filter((metric) => sections.some((s) => s !== undefined && [...s.table.rows.keys()].some((k) => k.startsWith(metric.row))));
    const rows = reports.flatMap((report, index) =>
      variants.map((variant) => [report.label, variant, ...metrics.map((metric) => value(sections[index], variant, metric.row))]),
    );
    if (item.group !== group) {
      group = item.group;
      out.push("", `## ${group}`);
    }
    if (item.title !== item.group) out.push("", `### ${item.title}`);
    out.push("", table(["Proveedor", "Variante", ...metrics.map((metric) => metric.head)], rows));
  }
  return out.join("\n");
}

export function summarize(target = "BENCH.md"): void {
  const reports = REPORTS.filter((item) => existsSync(item.path)).map((item) => parseReport(item.label, item.path, readFileSync(item.path, "utf8")));
  const text = readFileSync(target, "utf8");
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start < 0 || end < start) throw new Error(`${target} has no ${START} ... ${END} block`);
  writeFileSync(target, `${text.slice(0, start + START.length)}\n\n${render(reports)}\n\n${text.slice(end)}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) summarize();
