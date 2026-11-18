import { test } from "node:test";
import assert from "node:assert/strict";
import { openApp, shorten } from "../support.mjs";

// The customer's smallest promise, made in the customer's words:
// "Give me a link, I get a shorter one, and visiting it takes me exactly where I said. Show me why."
const CARGOES = [
  "https://example.com/bakery/lisbon/the-trailing-slash/recipes/pastel-de-nata",
  "https://example.org/a/b/c/d/e/f/g/h/i/j",
  "http://docs.example.net/guide/getting-started/installing-the-thing.html?ref=newsletter",
];

test("a long link becomes a shorter one that takes the visitor where they asked, and the docket shows every hearing", async () => {
  const env = await openApp();
  try {
    for (const url of CARGOES) {
      const created = await shorten(env.app, url);
      assert.equal(created.status, 201, url);
      assert.ok(created.body.short.length < url.length, `${created.body.short} is not shorter than ${url}`);

      const visit = await env.app.handle("GET", `/${created.body.code}`);
      assert.equal(visit.status, 302);
      assert.equal(visit.headers.location, url);

      const docket = await env.app.handle("GET", `/${created.body.code}?case`);
      assert.match(docket.body, /Hearings traversed: 200 \(200 per attempt, 1 attempt\)/);
      assert.match(docket.body, /Treasury: reconciled/);
    }
  } finally {
    await env.close();
  }
});
