import { after, test } from "node:test";
import assert from "node:assert/strict";
import { openApp } from "../support.mjs";
import { createHttpServer } from "../../src/server.mjs";

const env = await openApp();
const server = createHttpServer(env.app);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(async () => {
  server.close();
  await env.close();
});

const LONG = "https://example.com/bakery/lisbon/the-trailing-slash/recipes/pastel-de-nata";
const post = (path, body, headers = { "content-type": "application/json" }) =>
  fetch(`${base}${path}`, { method: "POST", body, headers });

test("POST /shorten answers 201 with a JSON bill of lading and a case header", async () => {
  const response = await post("/shorten", JSON.stringify({ url: LONG }));
  assert.equal(response.status, 201);
  assert.match(response.headers.get("content-type"), /^application\/json/);
  assert.match(response.headers.get("x-mullet-case"), /^C\d{5}$/);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["case", "code", "replayed", "short", "url"]);
  assert.equal(body.replayed, false);
  assert.equal(body.url, LONG);
  assert.equal(body.short, `http://localhost:8080/${body.code}`);
});

test("POST /shorten answers 200 for a replayed cargo, with the same code", async () => {
  const first = await (await post("/shorten", JSON.stringify({ url: LONG }))).json();
  const replay = await post("/shorten", JSON.stringify({ url: LONG }));
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).code, first.code);
});

test("POST /shorten refuses bad JSON, missing cargo and declined cargo with JSON errors", async () => {
  for (const [body, status] of [["{oops", 400], ["", 400], ["{}", 400], [JSON.stringify({ url: "https://a.io/" }), 422]]) {
    const response = await post("/shorten", body);
    assert.equal(response.status, status, body);
    assert.match(response.headers.get("content-type"), /^application\/json/);
    assert.equal(typeof (await response.json()).error, "string");
  }
});

test("GET /<code> is a 302 with a Location and no-store, and an unknown code is a text 404", async () => {
  const { code } = await (await post("/shorten", JSON.stringify({ url: LONG }))).json();
  const redirect = await fetch(`${base}/${code}`, { redirect: "manual" });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("location"), LONG);
  assert.equal(redirect.headers.get("cache-control"), "no-store");

  const missing = await fetch(`${base}/zzzzzz`, { redirect: "manual" });
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get("content-type"), /^text\/plain/);
});

test("GET /<code>?case returns the docket as text", async () => {
  const { code } = await (await post("/shorten", JSON.stringify({ url: LONG }))).json();
  const docket = await fetch(`${base}/${code}?case`);
  assert.equal(docket.status, 200);
  const text = await docket.text();
  assert.match(text, /^CASE C\d{5} — GET \/.*\?case/);
  assert.match(text, /Hearings traversed: 200/);
});

test("the health and help pages answer, and unsupported methods are turned away", async () => {
  const health = await fetch(`${base}/_healthz`);
  assert.equal(health.status, 200);
  assert.deepEqual(Object.keys(await health.json()).sort(), ["appealDepth", "hearingsPerAttempt", "jvm", "ledger", "status"]);
  const help = await fetch(`${base}/`);
  assert.match(await help.text(), /POST \/shorten/);
  const refused = await fetch(`${base}/`, { method: "DELETE" });
  assert.equal(refused.status, 405);
  assert.equal(refused.headers.get("allow"), "GET, POST");
  assert.equal((await post("/elsewhere", "{}")).status, 404);
});

test("an oversized body is refused before the court sees it", async () => {
  const response = await post("/shorten", JSON.stringify({ url: "https://example.com/" + "a".repeat(9000) }));
  assert.equal(response.status, 413);
});

test("an unexpected failure is answered 500 in plain words", async () => {
  const broken = createHttpServer({ handle: async () => { throw new Error("the register is on fire"); } });
  await new Promise((resolve) => broken.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${broken.address().port}/anything`);
    assert.equal(response.status, 500);
    assert.equal(await response.text(), "The court adjourned unexpectedly.\n");
  } finally {
    broken.close();
    broken.closeAllConnections();
  }
});
