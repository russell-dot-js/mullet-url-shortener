# Mullet URL Shortener

`POST /shorten` with a long URL and get back a six-character code. `GET /<code>` redirects to the original
URL, but only after the cargo has survived a tribunal of 200 hearings, a check digit held in JVM bytecode,
and a route lottery. Every redirect is an architectural decision. The URLs get shorter and the codebase gets longer.

The working two lines: a short code maps to one registered URL, and a visit to the code redirects to it.
Everything else is the appropriation.

## Run it

Requirements: Node 22.17 or later, and a JDK with `javac` and `java` on `PATH` (set `JAVA_BIN` to override).
There are no npm dependencies.

```sh
npm run build                      # charter -> statute book, engrave -> Mint.j, assemble -> Mint.class, javac Relay
npm start                          # listens on PORT (default 8080)

curl -s -X POST localhost:8080/shorten \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/bakery/lisbon/the-trailing-slash/recipes/pastel-de-nata"}'
curl -si 'localhost:8080/<code>'          # 302 after the hearings (quote the URL: < and ? are shell syntax)
curl -s  'localhost:8080/<code>?case'     # the docket for that visit
```

| Environment | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port (`0` picks one; the process prints it) |
| `MULLET_DATA_DIR` | `./data` | ledger and broker offsets |
| `MULLET_PUBLIC_BASE` | `http://localhost:8080/` | prefix for the `short` field in responses |
| `MULLET_PIN` | empty | pin routes, e.g. `derive=hex,encode=table` |
| `JAVA_BIN` | `java` | the java executable that runs `Relay` |

## Endpoints

| Request | Answer |
| --- | --- |
| `POST /shorten` `{"url": ...}` | `201` new code, `200` replay of the same cargo, `400` malformed or not http(s), `413` too long, `422` the Compression Office declines, `409` every appeal exhausted |
| `GET /<code>` | `302` with `location` and `cache-control: no-store` when discharged; `404` remanded, with the reason |
| `GET /<code>?case` | `200` the docket for that hearing, as text |
| `GET /_cases/<id>` | the docket for any case on the record |
| `GET /_healthz` | status, hearings per attempt, appeal depth, ledger size |
| `GET /` | help text |

Every response carries `x-mullet-case`. Unsupported methods get `405` with `allow: GET, POST`.

## How a request moves

**Shortening** (`src/shortener.mjs`). The cargo is canonicalized with `new URL(...).href`, and only http and https
are accepted. The idempotency key is `sha256(url)`. Before anything is written, the derive and encode routes are
drawn from the lottery. A known key replays its bill of lading. The Compression Office declines any cargo whose
short form (22-character base plus 6) would be no shorter. Otherwise the shortener tries salts `0..appealDepth`:
`payload = derive(url, salt)`, `digits = encode(payload)`, `check = Mint.checkIndex(payload)` (the JVM), and
`code = digits + ALPHABET[check]`. A code already held by another payload is a jurisdictional collision, and the
shortener appeals to the next salt. Only the appeal that finds a free slot is registered.

**Discharge** (`src/app.mjs`). The front door refuses anything that is not six base-62 characters. The first five
characters decode to a payload, and the sixth is the check index. `Mint.verdict(payload, check)` runs in the JVM
and is the only check on the check digit. The register is looked up by payload. `hearCase` then runs the statute
of 200 hearings. The result is published to the topic, and the response is a 302 or a 404 with the remand reason.

**Tribunal** (`src/tribunal.mjs`, `src/clerk.mjs`, `src/treasury.mjs`). The statute is generated from
`constitution.json` by `scripts/charter.mjs`. It holds 200 articles, and each article is a hearing held by one of
five offices. The five offices and eight hearing titles give 40 distinct (office, title) pairs, and the 200 layers
cycle through them, so each pair is sat five times. Each hearing is syndicated to 16 underwriters, who present
priced instruments to the clerk. The clerk's roll carries a hearing only when the evidence is valid and no shortfall
has been shown, and a hearing carries only if the one before it carried. Fees move through a five-account
double-entry treasury: 40% of each cleared fee is withheld in escrow until the case closes. The case is appealed
up to `appealDepth` times, and each appeal re-runs the whole statute against a fresh treasury.

**Register and broker** (`src/registry.mjs`, `src/topic.mjs`). The register is an append-only, hash-chained
`ledger.jsonl`. It refuses a broken chain, a duplicate code and a duplicate payload, and it cuts off an interrupted
final line on reopen. Every shorten and discharge is published to the `redirects` topic, which has three partitions
keyed by code. Two consumer groups, `audit` and `analytics`, commit their own offsets after each record. Consumers
catch up at the start of the next request, and analytics counts discharges once per record.

**WET routes** (`src/wet/`). Each operation has three independent implementations behind one contract. Derive has
`uint32`, `hex` and `bigint`. Encode has `divmod`, `table` and `reduce`. `draw` picks one route uniformly, `pick`
applies the pins, and the winning name appears in the docket under *Routes drawn*.

**JVM custody** (`jvm/Mint.j`, `jvm/Relay.java`, `scripts/jasm.mjs`, `scripts/engrave.mjs`). `engrave` writes
`Mint.j` from a seed: a 62-slot permutation table in `<clinit>`, a `checkIndex` that folds the base-62 digits and
maps them through the table, and a `verdict` that returns 1 only for the check the JVM would have issued. `jasm`
assembles it to class file version 49 (no StackMapTable). `Relay` answers a line protocol on stdin and stdout.
`Mint` runs it as a child process.

## Appropriations

| Mandate (`constitution.json`) | Implementation |
| --- | --- |
| `layers: 200` | `src/generated/statute-book.mjs`, 200 articles, sat in order by `hearCase` |
| `appeal_depth: 2` | up to 3 attempts per discharge, and up to 3 salts per registration |
| `escrow_percent: 40` | `Treasury` withholds 40% of each cleared fee until settlement |
| `partitions: 3`, `consumer_groups: 2` | `Topic` with 3 partitions; `audit` and `analytics` groups with their own offsets |
| `franchises: 16` | 16 underwriters syndicated to each hearing |
| `offices: 5`, `hearings: 8` | the statute's 40 distinct (office, title) pairs |
| `target_loc: 1000000000` | the personal target, used by `scripts/loc.mjs` and the board |

The skill's Windows and SQL CLR section does not apply: the target is darwin.

## Decisions and amendments

These are the places where the code departs from the first sketch, and why.

- **Vendored syndication was amended.** The rebate tariff was `balance(debit) / band`, uncapped. It drained the
  treasury, and a valid case failed at hearing 37 on every appeal. It is now `Math.min(1000, ...)` in
  `scripts/syndication.mjs`. Verified: valid cases discharge in one attempt, 200 hearings traversed, books reconciled;
  invalid cases take three attempts, 600 hearings traversed.
- **The register is keyed by payload, not code.** Keyed by code, the JVM check was redundant: a mutant that skipped
  `Mint.verdict` was equivalent to the real code, because the code string already implied the check. Keyed by
  payload, the JVM is the only thing that can refuse a forged check digit.
- **The ledger refuses duplicates before it writes.** A duplicate code was once appended to disk and then refused in
  memory, which left a ledger that could not reopen. The check now runs before the append. The unit test covers both
  the refusal and a chain-valid forgery that is refused on reopen.
- **Settlement releases only what was withheld.** The escrow account's seed float is never moved. On discharge the
  withheld share goes to the treasury; on remand it goes back to the applicant.
- **A remand keeps the fees already cleared.** On remand the applicant gets the withheld 40% back. The 60% already
  cleared to the underwriter stays with the underwriter, and the test asserts this.
- **Inspection is not discharge.** `?case` re-runs the hearing so the docket can be called again, and it publishes
  as `inspected`. Analytics counts only redirects.
- **The statute reuses titles.** The "200 hearings" are 40 distinct (office, title) pairs, each sat five times. This
  is the consequence of the charter's five offices and eight hearings.

## Tests

The smallest promise is in `tests/acceptance`: a long link becomes a shorter one that takes the visitor where they
asked, and the docket shows every hearing. Each tier names the defect the tier below could miss.

| Tier | Files | Defect it catches that the tier below would not |
| --- | --- | --- |
| unit | `tests/unit/*` | one route disagreeing with the oracle; a tampered or interrupted ledger; a redelivered record handled twice; an overdraw posted |
| component | `tests/component/tribunal.test.mjs` | a hearing skipped or reordered; a remand that does not stop the hearings after it; a non-deterministic roll |
| integration | `tests/integration/app.test.mjs` | the JVM verdict ignored; a collision that is not appealed; a docket that misstates the hearing |
| contract | `tests/contract/http.test.mjs` | a 200 returned for a new code; a missing `no-store`; a 500 that leaks a stack |
| e2e | `tests/e2e/server.test.mjs` | the real process failing to reload the register after a restart |
| acceptance | `tests/acceptance/acceptance.test.mjs` | the customer's promise: a shorter link that redirects to the original |

The suite covers the duplicate-delivery and interrupted-write cases, the lottery's uniformity over 9,000 seeded draws,
and the oracle's 400 generated payloads.

Run them with `npm test` (builds first, then runs with coverage) or `npm run acceptance` alone.

## Lineup

`npm run lineup` (`scripts/lineup.mjs`) runs the real code and four copies, each with one plausible defect, through
the same witnesses. A copy is convicted only by a failed assertion in its named exhibit. A file that never loads is a
mistrial. Two credentials go through the same lineup: `lineup/witnesses/nodder.test.mjs`, which passes every
exhibit without looking, and `lineup/witnesses/thrower.test.mjs`, which throws before it sees the evidence. The
harness refuses both. The report is in `docs/lineup.md`.

## Coverage

Measured by `npm test` with Node's coverage: 99.33% of lines, 93.87% of branches and 98.41% of functions across the
modules the suite loads, with `src/generated/**` excluded. The uncovered lines and the unmeasured child processes are
listed in `docs/coverage.md`.

## Board

`npm run board` (`scripts/board.mjs`) runs three scenarios through the real application: an uncontested case, the
jurisdictional collision, and a rejection, a remand and a replay. It writes the dockets to `docs/dockets/`, the
report to `docs/board.md`, and a souvenir certificate to `docs/souvenir.txt`.

## Lines of code

`npm run loc` (`scripts/loc.mjs`) counts non-blank physical lines. Maintained source is every hand-kept code file under
`src`, `scripts`, `tests`, `lineup` and `jvm`, including the JVM assembly and the tests. The generated statute book is
reported separately. The JVM quota is the share of maintained lines that are opcode lines in `Mint.j`: not blank, not
comment, not directive, not label-only. The command exits nonzero below 10%. The current numbers are in `docs/loc.md`.

## Known gaps

- The JVM share is 10.32% against a 10% quota. Every new line in `scripts/` or `tests/` dilutes it, and the quota
  check will fail the build when it dips below.
- The lineup has four copies. Each is convicted by one named exhibit, and no survivors were found among them. That is
  four faults, not a proof of coverage.
- The CLI entry points of `scripts/engrave.mjs` and `scripts/jasm.mjs` and the server process started by `src/main.mjs`
  are not in the coverage numbers.
- The statute's 200 hearings are 40 distinct titles repeated five times.
