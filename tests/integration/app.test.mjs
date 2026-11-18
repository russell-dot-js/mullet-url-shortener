import { test } from "node:test";
import assert from "node:assert/strict";
import { openApp, shorten } from "../support.mjs";
import { ROUTES } from "../../src/wet/index.mjs";
import { oracleCheckChar, oracleEncode } from "../oracle.mjs";

const LONG = "https://example.com/bakery/lisbon/the-trailing-slash/recipes/pastel-de-nata";

test("the uncontested case: a long cargo is registered once, replayed, and discharged with a 302", async () => {
  const env = await openApp();
  try {
    const created = await shorten(env.app, LONG);
    assert.equal(created.status, 201);
    assert.equal(created.body.code.length, 6);
    const again = await shorten(env.app, LONG);
    assert.equal(again.status, 200);
    assert.equal(again.body.code, created.body.code);
    assert.equal(env.app.registry.size, 1, "a replay writes nothing new");

    const visit = await env.app.handle("GET", `/${created.body.code}`);
    assert.equal(visit.status, 302);
    assert.equal(visit.headers.location, LONG);
    assert.equal(visit.headers["cache-control"], "no-store");
  } finally {
    await env.close();
  }
});

test("the Compression Office declines a cargo that would not get any shorter", async () => {
  const env = await openApp();
  try {
    const declined = await shorten(env.app, "https://a.io/");
    assert.equal(declined.status, 422);
    assert.match(declined.body.error, /declines: a 28-character short form/);
    assert.equal(env.app.registry.size, 0);
  } finally {
    await env.close();
  }
});

test("cargo that is empty, malformed or not web-bound is refused at the counter", async () => {
  const env = await openApp();
  try {
    assert.equal((await env.app.handle("POST", "/shorten", "")).status, 400);
    assert.equal((await env.app.handle("POST", "/shorten", "not json")).status, 400);
    assert.equal((await env.app.handle("POST", "/shorten", "null")).status, 400);
    assert.equal((await shorten(env.app, "")).status, 400);
    assert.equal((await shorten(env.app, "not a url at all, really")).status, 400);
    const ftp = await shorten(env.app, "ftp://example.com/long/path/to/some/cargo");
    assert.equal(ftp.status, 400);
    assert.match(ftp.body.error, /Only http and https/);
  } finally {
    await env.close();
  }
});

test("a forged check digit is refused at the JVM's custody, even though the payload is on the register", async () => {
  const env = await openApp();
  try {
    const { body } = await shorten(env.app, LONG);
    const forged = body.code.slice(0, 5) + (body.code[5] === "a" ? "b" : "a");
    const visit = await env.app.handle("GET", `/${forged}`);
    assert.equal(visit.status, 404);
    assert.match(visit.body, /the JVM refused custody of this bill of lading's check digit/);
    assert.equal((await env.app.handle("GET", `/${body.code}`)).status, 302);
  } finally {
    await env.close();
  }
});

test("a well-formed code with a true check digit but no cargo on the register is remanded for lack of cargo", async () => {
  const env = await openApp();
  try {
    const payload = 12345;
    const code = oracleEncode(payload) + oracleCheckChar(payload);
    const visit = await env.app.handle("GET", `/${code}`);
    assert.equal(visit.status, 404);
    assert.match(visit.body, /no cargo is registered under this bill of lading/);
  } finally {
    await env.close();
  }
});

test("the front door refuses what is not a bill of lading, and unknown paths get no hearing at all", async () => {
  const env = await openApp();
  try {
    const malformed = await env.app.handle("GET", "/abc");
    assert.equal(malformed.status, 404);
    assert.match(malformed.body, /Refused at the front door/);
    assert.equal((await env.app.handle("GET", "/a/b")).status, 404);
    assert.equal((await env.app.handle("PUT", "/anything")).status, 405);
  } finally {
    await env.close();
  }
});

test("a jurisdictional collision is appealed to the next salt, and both cargoes reach their own URLs", async () => {
  const routes = { derive: { rigged: (url, salt) => (salt === 0 ? 1000 : 2000) }, encode: ROUTES.encode };
  const env = await openApp({ routes });
  try {
    const first = await shorten(env.app, "https://example.com/first/cargo/on/the/manifest");
    const second = await shorten(env.app, "https://example.com/second/cargo/on/the/manifest");
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.notEqual(first.body.code, second.body.code);
    const filing = await env.app.handle("GET", `/_cases/${second.body.case}`);
    assert.match(filing.body, /Note: jurisdictional collision at salt 0: \S+ is already held; appealing/);
    assert.match(filing.body, /Note: registered \S+ at salt 1/);
    assert.equal((await env.app.handle("GET", `/${first.body.code}`)).headers.location, "https://example.com/first/cargo/on/the/manifest");
    assert.equal((await env.app.handle("GET", `/${second.body.code}`)).headers.location, "https://example.com/second/cargo/on/the/manifest");
  } finally {
    await env.close();
  }
});

test("when every appeal to the register collides, the filing is remanded with no code issued", async () => {
  const routes = { derive: { stuck: () => 1000 }, encode: ROUTES.encode };
  const env = await openApp({ routes });
  try {
    assert.equal((await shorten(env.app, "https://example.com/the/first/cargo/filed")).status, 201);
    const stuck = await shorten(env.app, "https://example.com/the/second/cargo/filed");
    assert.equal(stuck.status, 409);
    assert.match(stuck.body.error, /every appeal to the register has been exhausted/);
    assert.equal(env.app.registry.size, 1);
  } finally {
    await env.close();
  }
});

test("the docket explains the hearing, and only a redirect counts as a discharge for analytics", async () => {
  const env = await openApp();
  try {
    const { body } = await shorten(env.app, LONG);
    const docket = await env.app.handle("GET", `/${body.code}?case`);
    assert.equal(docket.status, 200);
    assert.match(docket.body, /Hearings traversed: 200 \(200 per attempt, 1 attempt\)/);
    assert.match(docket.body, /Final roll: 200 of 200 carried/);
    assert.match(docket.body, /Minority report \(the night janitor\): the roll counted 200 hearings and 40 distinct titles/);
    const id = docket.headers["x-mullet-case"];
    assert.equal((await env.app.handle("GET", `/_cases/${id}`)).body, docket.body);
    assert.equal((await env.app.handle("GET", "/_cases/C99999")).status, 404);

    env.app.flush();
    assert.equal(env.app.discharges.get(body.code) ?? 0, 0, "inspecting a docket is not a discharge");
    await env.app.handle("GET", `/${body.code}`);
    env.app.flush();
    env.app.flush();
    assert.equal(env.app.discharges.get(body.code), 1, "a redirect counts once, however often the consumer is polled");
  } finally {
    await env.close();
  }
});
