// The board. Runs three demonstration scenarios through the real application: an uncontested case, the
// jurisdictional collision, and a rejection, a remand and a replay. Writes the dockets, the board report,
// the line count and a souvenir certificate under docs/. Prints the rulings it saw.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApp } from "../src/app.mjs";
import { ROUTES } from "../src/wet/index.mjs";
import { oracleCheckChar, oracleEncode } from "../tests/oracle.mjs";
import { measure, ROOT as REPO } from "./loc.mjs";

const DOCS = join(REPO, "docs");
const UNCONTESTED = "https://example.com/bakery/lisbon/the-trailing-slash/recipes/pastel-de-nata";
const COLLIDING = [
  "https://example.com/first/cargo/on/the/manifest",
  "https://example.com/second/cargo/on/the/manifest",
];
// A route that sends every cargo to the same payload at salt 0, so the second cargo must appeal.
const RIGGED = { derive: { rigged: (url, salt) => (salt === 0 ? 1000 : 2000) }, encode: ROUTES.encode };
const RULING = /Notable ruling: "(.*?)"; (enacted|remanded), fees cleared (\d+)/g;

const constitution = JSON.parse(readFileSync(join(REPO, "constitution.json"), "utf8"));

async function withApp(options, run) {
  const dataDir = mkdtempSync(join(tmpdir(), "mullet-board-"));
  const app = await createApp({ dataDir, ...options });
  try {
    return await run(app);
  } finally {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
}

const post = (app, url) => app.handle("POST", "/shorten", JSON.stringify({ url }));
const row = (request, response) => ({ request, status: response.status, case: response.headers["x-mullet-case"] });
const codeOf = (response) => JSON.parse(response.body).code;

async function uncontested(app) {
  const created = await post(app, UNCONTESTED);
  const code = codeOf(created);
  const docket = await app.handle("GET", `/${code}?case`);
  const visit = await app.handle("GET", `/${code}`);
  if (visit.headers.location !== UNCONTESTED) throw new Error("the uncontested cargo did not reach its URL");
  return {
    rows: [
      row("POST /shorten (long cargo)", created),
      row("GET /<code>?case (docket)", docket),
      row("GET /<code> (redirect, 302)", visit),
    ],
    texts: [docket.body],
  };
}

async function collision(app) {
  const first = await post(app, COLLIDING[0]);
  const second = await post(app, COLLIDING[1]);
  const filing = await app.handle("GET", `/_cases/${JSON.parse(second.body).case}`);
  const code = codeOf(second);
  const docket = await app.handle("GET", `/${code}?case`);
  const visit = await app.handle("GET", `/${code}`);
  if (visit.headers.location !== COLLIDING[1]) throw new Error("the appealed cargo did not reach its URL");
  return {
    rows: [
      row("POST /shorten (first cargo)", first),
      row("POST /shorten (second cargo, collides at salt 0)", second),
      row("GET /_cases/<filing> (the appeal, in the filing's own docket)", filing),
      row("GET /<code> (redirect, 302)", visit),
    ],
    texts: [filing.body, docket.body],
  };
}

async function rejection(app) {
  const created = await post(app, UNCONTESTED);
  const code = codeOf(created);
  const replay = await post(app, UNCONTESTED);
  const declined = await post(app, "https://a.io/");
  const forged = code.slice(0, 5) + (code[5] === "a" ? "b" : "a");
  const forgedVisit = await app.handle("GET", `/${forged}`);
  const forgedDocket = await app.handle("GET", `/${forged}?case`);
  const unregistered = `${oracleEncode(12345)}${oracleCheckChar(12345)}`;
  const unknownVisit = await app.handle("GET", `/${unregistered}`);
  const unknownDocket = await app.handle("GET", `/${unregistered}?case`);
  return {
    rows: [
      row("POST /shorten (long cargo)", created),
      row("POST /shorten (same cargo again: replay)", replay),
      row("POST /shorten (cargo the Compression Office declines)", declined),
      row("GET /<forged check digit> (JVM refuses custody)", forgedVisit),
      row("GET /<valid code, no cargo registered> (remand)", unknownVisit),
    ],
    texts: [forgedDocket.body, unknownDocket.body],
  };
}

export function rulingsIn(text) {
  return [...text.matchAll(RULING)].map((match) => ({ title: match[1], outcome: match[2], fees: Number(match[3]) }));
}

const table = (header, rows) => [
  `| ${header.join(" | ")} |`,
  `| ${header.map(() => "---").join(" | ")} |`,
  ...rows.map((cells) => `| ${cells.join(" | ")} |`),
];

const fmt = (value) => value.toLocaleString("en-US");

export async function runBoard() {
  const scenarios = [
    { name: "uncontested", slug: "uncontested", options: {}, run: uncontested },
    { name: "jurisdictional collision", slug: "collision", options: { routes: RIGGED }, run: collision },
    { name: "rejection, remand and replay", slug: "rejection", options: {}, run: rejection },
  ];
  const results = [];
  for (const scenario of scenarios) {
    results.push({ ...scenario, ...(await withApp(scenario.options, scenario.run)) });
  }

  mkdirSync(join(DOCS, "dockets"), { recursive: true });
  results.forEach((result, index) => {
    writeFileSync(join(DOCS, "dockets", `${index + 1}-${result.slug}.txt`), result.texts.join("\n"));
  });

  const rulings = results.flatMap((result) => result.texts.flatMap(rulingsIn));
  const costliest = rulings.reduce((best, ruling) => (best === null || ruling.fees > best.fees ? ruling : best), null);
  const uncontestedDocket = results[0].texts[0];
  const hearings = Number(uncontestedDocket.match(/Hearings traversed: (\d+)/)[1]);
  const lines = measure();

  const souvenir = [
    "CERTIFICATE OF DISCHARGE",
    "Issued by the Ombudsman of Redirects, as a souvenir of the board's record",
    "",
    `Cargo discharged: ${UNCONTESTED}`,
    `Hearings sat: ${hearings} (${constitution.layers} chartered, 1 attempt)`,
    `Underwriters per hearing: ${constitution.franchises.length}`,
    "Treasury: reconciled",
    `Maintained source: ${fmt(lines.maintained)} lines`,
    `Shortfall against the personal target of ${fmt(constitution.target_loc)} lines: ${fmt(lines.shortfall)} lines`,
    "",
    "This certificate is not a bill of lading and confers no right of redirection.",
    "",
  ].join("\n");
  writeFileSync(join(DOCS, "souvenir.txt"), souvenir);

  const report = [
    "# Board report",
    "",
    "Three scenarios, run through the real application: the HTTP-level `handle` entry point, the real JVM",
    "custody, the real tribunal and the real ledger in a scratch directory.",
    "",
    "## Scenarios",
    "",
    ...table(["Scenario", "Request", "Status", "Case"], results.flatMap((result) =>
      result.rows.map((item) => [result.name, item.request, String(item.status), item.case ?? ""]))),
    "",
    "## Dockets",
    "",
    ...results.map((result) => `- \`docs/dockets/${results.indexOf(result) + 1}-${result.slug}.txt\`: ${result.name}`),
    "",
    "## Notable rulings seen in the run",
    "",
    ...rulings.map((ruling) => `- "${ruling.title}": ${ruling.outcome}, fees cleared ${fmt(ruling.fees)}`),
    "",
    `Costliest ruling: "${costliest.title}" (${costliest.outcome}, fees cleared ${fmt(costliest.fees)}).`,
    "",
    "## Measure",
    "",
    `Maintained source: ${fmt(lines.maintained)} lines. JVM opcode lines: ${fmt(lines.opcodes)} (${lines.percent.toFixed(2)}%, quota ${lines.quota}%).`,
    `Shortfall against ${fmt(constitution.target_loc)} lines: ${fmt(lines.shortfall)} lines. See \`docs/loc.md\`.`,
    "",
    "The lineup is in `docs/lineup.md`. Coverage is in `docs/coverage.md`.",
    "",
  ].join("\n");
  writeFileSync(join(DOCS, "board.md"), report);

  return { results, rulings, costliest, lines };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { results, rulings, costliest, lines } = await runBoard();
  for (const result of results) {
    for (const item of result.rows) console.log(`${result.name.padEnd(30)} ${String(item.status).padEnd(4)} ${item.request}`);
  }
  console.log("");
  console.log("Notable rulings seen in the run:");
  for (const ruling of rulings) console.log(`  "${ruling.title}" (${ruling.outcome}, fees ${ruling.fees})`);
  console.log(`Costliest: "${costliest.title}" (${costliest.outcome}, fees ${costliest.fees})`);
  console.log(`Shortfall against the target: ${lines.shortfall.toLocaleString("en-US")} lines`);
}
