import { test } from "node:test";
import assert from "node:assert/strict";
import { ROUTES, draw, parsePins, pick } from "../../src/wet/index.mjs";
import { CAPACITY } from "../../src/wet/contract.mjs";
import { oracleDerive, oracleEncode } from "../oracle.mjs";

const URLS = [
  "https://example.com/",
  "http://a.io/x?y=1",
  "https://example.com/bakery/lisbon/the-trailing-slash/",
  "https://xn--caf-dma.example/%E8%B7%AF%E5%BE%84",
];
const PAYLOADS = [
  0, 1, 61, 62, 3843, 3844, CAPACITY - 1,
  ...Array.from({ length: 400 }, (_, index) => (index * 2654435 + 17) % CAPACITY),
];

test("every derive route agrees with the oracle on every appeal salt", () => {
  for (const url of URLS) {
    for (let salt = 0; salt < 4; salt++) {
      const expected = oracleDerive(url, salt);
      for (const [name, route] of Object.entries(ROUTES.derive)) {
        assert.equal(route(url, salt), expected, `derive ${name} disagrees for ${url} at salt ${salt}`);
      }
    }
  }
});

test("every encode route agrees with the oracle", () => {
  for (const payload of PAYLOADS) {
    const expected = oracleEncode(payload);
    for (const [name, route] of Object.entries(ROUTES.encode)) {
      assert.equal(route(payload), expected, `encode ${name} disagrees at payload ${payload}`);
    }
  }
});

test("every route refuses an out-of-register payload with the same error", () => {
  for (const bad of [-1, CAPACITY, 1.5, Number.NaN]) {
    const outcomes = Object.values(ROUTES.encode).map((route) => {
      try {
        route(bad);
        return "no error";
      } catch (error) {
        return `${error.name}: ${error.message}`;
      }
    });
    assert.equal(new Set(outcomes).size, 1, outcomes.join(" | "));
    assert.match(outcomes[0], /^RangeError: payload /);
  }
});

test("every ticket in the lottery is exercised by a deterministic draw", () => {
  for (const operation of Object.keys(ROUTES)) {
    const names = Object.keys(ROUTES[operation]);
    names.forEach((name, index) => {
      assert.equal(draw(operation, { random: () => (index + 0.5) / names.length }), name);
    });
  }
});

test("random draws are close to uniform over the tickets", () => {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const counts = {};
  for (let draws = 0; draws < 9000; draws++) {
    const { name } = pick("encode", { random });
    counts[name] = (counts[name] ?? 0) + 1;
  }
  for (const count of Object.values(counts)) {
    assert.ok(Math.abs(count - 3000) < 300, `skewed draw: ${JSON.stringify(counts)}`);
  }
});

test("a pin overrides the lottery, and an unknown route is refused", () => {
  const pins = parsePins("derive=hex, encode=table");
  assert.deepEqual(pins, { derive: "hex", encode: "table" });
  assert.equal(draw("encode", { pins, random: () => 0.99 }), "table");
  assert.deepEqual(parsePins(""), {});
  assert.throws(() => parsePins("encode=nope"), /names no route/);
  assert.throws(() => parsePins("nope=divmod"), /names no route/);
  assert.throws(() => parsePins("encode"), /names no route/);
  assert.throws(() => draw("encode", { pins: { encode: "ghost" } }), /no route ghost/);
  assert.throws(() => draw("sing"), /no such operation/);
});
