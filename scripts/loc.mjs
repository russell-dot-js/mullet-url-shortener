// Measures maintained source against the chartered target. A line is a non-blank physical line.
// Maintained: every hand-kept code file under src, scripts, tests, lineup and jvm. Assembly and tests are in the denominator.
// Generated: src/generated/**, written by scripts/charter.mjs. Reported apart and left out of the denominator.
// Opcode lines: the instruction lines of the JVM assembly (not blank, not comment, not directive, not label-only).
// The JVM quota is opcode lines over maintained lines. Exit 1 when it falls below the quota.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const QUOTA_PERCENT = 10;
const CODE_EXTENSIONS = new Set([".mjs", ".js", ".java", ".j"]);
const MAINTAINED_ROOTS = ["src", "scripts", "tests", "lineup", "jvm"];
const GENERATED = /^src[\\/]generated[\\/]/;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

export function isOpcodeLine(line) {
  const text = line.trim();
  if (text === "" || text.startsWith(";") || text.startsWith(".")) return false;
  return !/^[A-Za-z_][A-Za-z0-9_]*:$/.test(text);
}

export function measure() {
  const constitution = JSON.parse(readFileSync(join(ROOT, "constitution.json"), "utf8"));
  const rows = MAINTAINED_ROOTS
    .flatMap((root) => walk(join(ROOT, root)))
    .filter((path) => CODE_EXTENSIONS.has(extname(path)))
    .map((path) => {
      const file = relative(ROOT, path);
      const lines = readFileSync(path, "utf8").split("\n");
      const isAssembly = extname(path) === ".j";
      return {
        file,
        root: file.split(/[\\/]/)[0],
        generated: GENERATED.test(file),
        lines: lines.filter((line) => line.trim() !== "").length,
        opcodes: isAssembly ? lines.filter(isOpcodeLine).length : 0,
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file));

  const maintainedRows = rows.filter((row) => !row.generated);
  const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);
  const maintained = sum(maintainedRows, "lines");
  const opcodes = sum(maintainedRows, "opcodes");
  const percent = maintained === 0 ? 0 : (opcodes / maintained) * 100;
  const perRoot = Object.fromEntries(MAINTAINED_ROOTS.map((root) => [
    root, sum(maintainedRows.filter((row) => row.root === root), "lines"),
  ]));
  return {
    rows,
    maintained,
    perRoot,
    generated: sum(rows.filter((row) => row.generated), "lines"),
    opcodes,
    percent,
    quota: QUOTA_PERCENT,
    target: constitution.target_loc,
    shortfall: constitution.target_loc - maintained,
  };
}

const formatNumber = (value) => value.toLocaleString("en-US");

function markdown(result) {
  const roots = Object.entries(result.perRoot)
    .map(([root, lines]) => `| ${root}/ | ${formatNumber(lines)} |`);
  return [
    "# Lines of code",
    "",
    "| Measure | Value |",
    "| --- | --- |",
    `| Maintained source (incl. JVM assembly and tests) | ${formatNumber(result.maintained)} lines |`,
    `| Generated, reported apart (src/generated/statute-book.mjs) | ${formatNumber(result.generated)} lines |`,
    `| JVM opcode lines (jvm/Mint.j) | ${formatNumber(result.opcodes)} |`,
    `| JVM share of maintained source | ${result.percent.toFixed(2)}% (quota ${result.quota}%) |`,
    `| Personal target (constitution.json target_loc) | ${formatNumber(result.target)} lines |`,
    `| Shortfall against the target | ${formatNumber(result.shortfall)} lines |`,
    "",
    "## Maintained source by root",
    "",
    "| Root | Lines |",
    "| --- | --- |",
    ...roots,
    "",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = measure();
  mkdirSync(join(ROOT, "docs"), { recursive: true });
  writeFileSync(join(ROOT, "docs/loc.md"), markdown(result));
  process.stdout.write(markdown(result));
  if (result.percent < result.quota) {
    process.stderr.write(`loc: the JVM holds ${result.percent.toFixed(2)}% of maintained source, below the ${result.quota}% quota\n`);
    process.exit(1);
  }
}
