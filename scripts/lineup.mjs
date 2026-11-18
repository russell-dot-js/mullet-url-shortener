// The lineup. The real implementation and four copies, each carrying one plausible defect, go through the same
// witnesses. Two credentials are then sent through the same lineup to show the harness refuses them: a nodder who
// passes everything and a thrower who fails before it has seen the evidence.
// Exit 0 only when the real code passes, every copy is convicted by its named exhibit, and both credentials are refused.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Each mutant changes one line of the real code. Its exhibit is the named test that must convict it.
export const MUTANTS = [
  {
    id: "M1",
    file: "src/tribunal.mjs",
    from: "for (const article of statute) seal",
    to: "for (const article of statute.slice(0, -1)) seal",
    defect: "the last hearing in the statute book is never sat",
    exhibit: "sits every hearing in the statute, in order, and counts each one",
  },
  {
    id: "M2",
    file: "src/app.mjs",
    from: "const stamped = await mint.verdict(payload, check);",
    to: "const stamped = true;",
    defect: "the JVM's verdict is ignored on the discharge path",
    exhibit: "a forged check digit is refused at the JVM's custody, even though the payload is on the register",
  },
  {
    id: "M3",
    file: "src/wet/encode.mjs",
    from: "ALPHABET[Math.floor(payload / power) % BASE]",
    to: "ALPHABET[Math.floor(payload / power) % (BASE - 1)]",
    defect: "the table route can never write the digit 'Z'",
    exhibit: "every encode route agrees with the oracle",
  },
  {
    id: "M4",
    file: "src/shortener.mjs",
    from: "const replay = this.#registry.byIdem(idem);",
    to: "const replay = undefined;",
    defect: "a replayed cargo is not recognized and is registered a second time",
    exhibit: "POST /shorten answers 200 for a replayed cargo, with the same code",
  },
];

// The credentials are sent through the same lineup as the real code. Neither may be accepted.
export const CREDENTIALS = [
  { name: "nodder", file: "lineup/witnesses/nodder.test.mjs", claim: "passes every exhibit without looking" },
  { name: "thrower", file: "lineup/witnesses/thrower.test.mjs", claim: "fails before it has seen the evidence" },
];

const SKIPPED = new Set(["data", "node_modules"]);

function copyTree(into) {
  cpSync(ROOT, into, {
    recursive: true,
    filter: (source) => !relative(ROOT, source).split(sep).some((part) => SKIPPED.has(part)),
  });
}

function testFiles(dir) {
  return readdirSync(join(dir, "tests"), { recursive: true })
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => join("tests", name))
    .sort();
}

function applyMutant(dir, mutant) {
  const path = join(dir, mutant.file);
  const source = readFileSync(path, "utf8");
  const matches = source.split(mutant.from).length - 1;
  if (matches !== 1) throw new Error(`${mutant.id}: expected exactly one match in ${mutant.file}, found ${matches}`);
  writeFileSync(path, source.replace(mutant.from, mutant.to));
}

// Reads node's TAP output: one verdict per named test, and whether its failure was an assertion.
export function parseTap(text) {
  const verdicts = new Map();
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const match = /^(not ok|ok) \d+ - (.*)$/.exec(lines[index]);
    if (!match) continue;
    const block = [];
    for (let next = index + 1; next < lines.length && !/^\s*\.\.\.$/.test(lines[next]); next++) block.push(lines[next]);
    verdicts.set(match[2], {
      passed: match[1] === "ok",
      assertion: block.some((line) => line.includes("code: 'ERR_ASSERTION'")),
    });
  }
  return verdicts;
}

function runSuite(dir, files) {
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...files], {
    cwd: dir, encoding: "utf8", timeout: 300000, maxBuffer: 64 * 1024 * 1024,
  });
  return { status: result.status, verdicts: parseTap(result.stdout ?? "") };
}

// A named exhibit convicts only by a failed assertion. A file that never loaded, or an exhibit that
// errored without asserting, is a mistrial: the witness never got to give evidence.
export function judge(verdicts, exhibit) {
  const verdict = verdicts.get(exhibit);
  if (verdict === undefined) return "mistrial: the exhibit was never reached";
  if (verdict.passed) return "acquitted";
  return verdict.assertion ? "convicted" : "mistrial: failed without an assertion";
}

// One trial: a fresh copy of the repository, optionally with one defect applied, and every witness run in it.
function sit(mutant) {
  const dir = mkdtempSync(join(tmpdir(), "mullet-lineup-"));
  try {
    copyTree(dir);
    if (mutant) applyMutant(dir, mutant);
    mkdirSync(join(dir, "lineup/witnesses"), { recursive: true });
    return {
      suite: runSuite(dir, testFiles(dir)),
      credentials: Object.fromEntries(CREDENTIALS.map((credential) => [credential.name, runSuite(dir, [credential.file])])),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function runLineup() {
  const real = sit(null);
  const copies = MUTANTS.map((mutant) => ({ mutant, ...sit(mutant) }));
  const problems = [];

  const realRows = MUTANTS.map((mutant) => ({ exhibit: mutant.exhibit, verdict: judge(real.suite.verdicts, mutant.exhibit) }));
  const realPasses = real.suite.status === 0 && realRows.every((row) => row.verdict === "acquitted");
  if (!realPasses) problems.push("the real implementation did not pass the witness");

  const convictions = copies.map(({ mutant, suite }) => ({
    id: mutant.id,
    defect: mutant.defect,
    exhibit: mutant.exhibit,
    verdict: judge(suite.verdicts, mutant.exhibit),
  }));
  for (const row of convictions) if (row.verdict !== "convicted") problems.push(`${row.id} was not convicted: ${row.verdict}`);

  const credentials = CREDENTIALS.map((credential) => {
    const onReal = MUTANTS.map((mutant) => judge(real.credentials[credential.name].verdicts, mutant.exhibit));
    const convicted = copies.filter(({ mutant, credentials: runs }) =>
      judge(runs[credential.name].verdicts, mutant.exhibit) === "convicted").length;
    const reasons = [];
    if (onReal.some((verdict) => verdict !== "acquitted")) {
      reasons.push(`mistrial on the real implementation (exit ${real.credentials[credential.name].status}): the exhibits were not all shown`);
    }
    if (convicted < MUTANTS.length) reasons.push(`convicted ${convicted} of ${MUTANTS.length} copies`);
    if (reasons.length === 0) problems.push(`the harness accepted the ${credential.name}, which it must refuse`);
    return { ...credential, convicted, reasons };
  });

  return { realPasses, realRows, convictions, credentials, problems };
}

function markdown(result) {
  const lines = [
    "# Lineup",
    "",
    "The real implementation and four copies, each with one plausible defect, go through the same witnesses.",
    "A copy is convicted only by a failed assertion in its named exhibit. A file that never loads is a mistrial.",
    "",
    `## Real implementation: ${result.realPasses ? "passes" : "DOES NOT PASS"}`,
    "",
    "| Exhibit | Verdict |",
    "| --- | --- |",
    ...result.realRows.map((row) => `| ${row.exhibit} | ${row.verdict} |`),
    "",
    "## Copies",
    "",
    "| Copy | Defect | Convicted by | Verdict |",
    "| --- | --- | --- | --- |",
    ...result.convictions.map((row) => `| ${row.id} | ${row.defect} | ${row.exhibit} | ${row.verdict} |`),
    "",
    "## Credentials (the harness must refuse both)",
    "",
    "| Credential | Claim | Result |",
    "| --- | --- | --- |",
    ...result.credentials.map((row) => `| ${row.name} | ${row.claim} | refused: ${row.reasons.join("; ")} |`),
    "",
    `Survivors: ${result.convictions.filter((row) => row.verdict !== "convicted").map((row) => row.id).join(", ") || "none"}`,
    "",
  ];
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runLineup();
  const report = markdown(result);
  mkdirSync(join(ROOT, "docs"), { recursive: true });
  writeFileSync(join(ROOT, "docs/lineup.md"), report);
  process.stdout.write(report);
  if (result.problems.length > 0) {
    process.stderr.write(`lineup: ${result.problems.join("; ")}\n`);
    process.exit(1);
  }
  process.stdout.write("lineup: the real code passes, every copy is convicted, and both credentials are refused\n");
}
