# Board report

Three scenarios, run through the real application: the HTTP-level `handle` entry point, the real JVM
custody, the real tribunal and the real ledger in a scratch directory.

## Scenarios

| Scenario | Request | Status | Case |
| --- | --- | --- | --- |
| uncontested | POST /shorten (long cargo) | 201 | C00001 |
| uncontested | GET /<code>?case (docket) | 200 | C00002 |
| uncontested | GET /<code> (redirect, 302) | 302 | C00003 |
| jurisdictional collision | POST /shorten (first cargo) | 201 | C00001 |
| jurisdictional collision | POST /shorten (second cargo, collides at salt 0) | 201 | C00002 |
| jurisdictional collision | GET /_cases/<filing> (the appeal, in the filing's own docket) | 200 | C00003 |
| jurisdictional collision | GET /<code> (redirect, 302) | 302 | C00005 |
| rejection, remand and replay | POST /shorten (long cargo) | 201 | C00001 |
| rejection, remand and replay | POST /shorten (same cargo again: replay) | 200 | C00002 |
| rejection, remand and replay | POST /shorten (cargo the Compression Office declines) | 422 | C00003 |
| rejection, remand and replay | GET /<forged check digit> (JVM refuses custody) | 404 | C00004 |
| rejection, remand and replay | GET /<valid code, no cargo registered> (remand) | 404 | C00006 |

## Dockets

- `docs/dockets/1-uncontested.txt`: uncontested
- `docs/dockets/2-collision.txt`: jurisdictional collision
- `docs/dockets/3-rejection.txt`: rejection, remand and replay

## Notable rulings seen in the run

- "Admiralty claim against the cook before Registrar of Short Codes": enacted, fees cleared 2,193
- "Admiralty claim against the cook before Port Authority": enacted, fees cleared 2,196
- "Admiralty claim against the cook before Registrar of Short Codes": remanded, fees cleared 2,193
- "Customs declaration for six characters before Ombudsman of Redirects": remanded, fees cleared 2,172

Costliest ruling: "Admiralty claim against the cook before Port Authority" (enacted, fees cleared 2,196).

## Measure

Maintained source: 2,820 lines. JVM opcode lines: 291 (10.32%, quota 10%).
Shortfall against 1,000,000,000 lines: 999,997,180 lines. See `docs/loc.md`.

The lineup is in `docs/lineup.md`. Coverage is in `docs/coverage.md`.
