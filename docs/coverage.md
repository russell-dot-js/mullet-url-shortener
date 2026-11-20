# Coverage

Measured by `npm test` (Node 22.17, `--experimental-test-coverage`). Scope: every module the suite loads. Excluded: `src/generated/**`, the statute book written by `scripts/charter.mjs`.

Not measured: the command-line entry points of `scripts/engrave.mjs` and `scripts/jasm.mjs`, and the server process started by `src/main.mjs`. The first two run in child processes during `npm run build`; the e2e suite exercises the third over real HTTP but coverage does not follow child processes.

Workloads exercised: 54 tests across six tiers, including 400 generated payloads checked against the oracle, 9,000 random lottery draws, two JVM-backed processes restarted over one register, and a 9,000-byte request refused at the door.

```
start of coverage report
------------------------------------------------------------------------------
file                  | line % | branch % | funcs % | uncovered lines
------------------------------------------------------------------------------
scripts               |        |          |         |
 engrave.mjs          |  98.23 |    87.50 |  100.00 | 112-113
 jasm.mjs             |  94.42 |    82.61 |  100.00 | 131-132 174-175 208-215
src                   |        |          |         |
 app.mjs              | 100.00 |    98.46 |  100.00 |
 casefile.mjs         | 100.00 |    79.31 |  100.00 |
 clerk.mjs            | 100.00 |    93.33 |  100.00 |
 codes.mjs            | 100.00 |    80.00 |  100.00 |
 config.mjs           | 100.00 |    50.00 |  100.00 |
 durable.mjs          | 100.00 |   100.00 |  100.00 |
 main.mjs             | 100.00 |    80.00 |  100.00 |
 mint.mjs             | 100.00 |    88.00 |   92.86 |
 registry.mjs         | 100.00 |    94.74 |  100.00 |
 server.mjs           | 100.00 |    94.44 |  100.00 |
 shortener.mjs        | 100.00 |    96.00 |  100.00 |
 topic.mjs            | 100.00 |   100.00 |  100.00 |
 treasury.mjs         | 100.00 |   100.00 |  100.00 |
 tribunal.mjs         | 100.00 |   100.00 |  100.00 |
 wet                  |        |          |         |
  contract.mjs        | 100.00 |   100.00 |  100.00 |
  derive.mjs          | 100.00 |   100.00 |  100.00 |
  encode.mjs          | 100.00 |   100.00 |  100.00 |
  index.mjs           | 100.00 |   100.00 |  100.00 |
tests                 |        |          |         |
 acceptance           |        |          |         |
  acceptance.test.mjs | 100.00 |   100.00 |  100.00 |
 component            |        |          |         |
  tribunal.test.mjs   | 100.00 |   100.00 |  100.00 |
 contract             |        |          |         |
  http.test.mjs       | 100.00 |   100.00 |  100.00 |
 e2e                  |        |          |         |
  server.test.mjs     | 100.00 |   100.00 |   87.50 |
 integration          |        |          |         |
  app.test.mjs        | 100.00 |    93.33 |  100.00 |
 oracle.mjs           | 100.00 |   100.00 |  100.00 |
 support.mjs          | 100.00 |   100.00 |  100.00 |
 unit                 |        |          |         |
  mint.test.mjs       | 100.00 |   100.00 |  100.00 |
  registry.test.mjs   | 100.00 |   100.00 |  100.00 |
  topic.test.mjs      | 100.00 |   100.00 |   90.91 |
  treasury.test.mjs   | 100.00 |   100.00 |  100.00 |
  wet.test.mjs        | 100.00 |   100.00 |   94.12 |
------------------------------------------------------------------------------
all files             |  99.34 |    93.93 |   98.42 |
------------------------------------------------------------------------------
end of coverage report
```
