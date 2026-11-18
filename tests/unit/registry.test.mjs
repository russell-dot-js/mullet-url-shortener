import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Registry, GENESIS, digest } from "../../src/registry.mjs";
import { scratchDir } from "../support.mjs";

const bill = (n) => ({
  idem: `idem-${n}`, code: `code${n}X`, url: `https://example.com/${n}/cargo`,
  payload: n, salt: 0, derive: "hex", encode: "table",
});

test("entries are chained, indexed and survive a reopen", () => {
  const dir = scratchDir();
  const first = new Registry(dir);
  const one = first.append(bill(1));
  const two = first.append(bill(2));
  assert.equal(one.prev, GENESIS);
  assert.equal(two.prev, one.hash);
  assert.equal(first.byCode("code2X").url, bill(2).url);
  assert.equal(first.byIdem("idem-1").code, "code1X");

  const reopened = new Registry(dir);
  assert.equal(reopened.size, 2);
  assert.equal(reopened.head, two.hash);
  assert.equal(reopened.recovered, false);
  rmSync(dir, { recursive: true, force: true });
});

test("an interrupted append is cut off and never parsed", () => {
  const dir = scratchDir();
  new Registry(dir).append(bill(1));
  appendFileSync(join(dir, "ledger.jsonl"), '{"seq":2,"idem":"idem-2","co');
  const recovered = new Registry(dir);
  assert.equal(recovered.size, 1);
  assert.equal(recovered.recovered, true);
  assert.ok(readFileSync(join(dir, "ledger.jsonl"), "utf8").endsWith("\n"));
  recovered.append(bill(2));
  assert.equal(new Registry(dir).size, 2);
  rmSync(dir, { recursive: true, force: true });
});

test("a tampered entry breaks the chain and the register refuses to open", () => {
  const dir = scratchDir();
  const registry = new Registry(dir);
  registry.append(bill(1));
  registry.append(bill(2));
  const file = join(dir, "ledger.jsonl");
  writeFileSync(file, readFileSync(file, "utf8").replace("https://example.com/1/cargo", "https://evil.example/1"));
  assert.throws(() => new Registry(dir), /ledger chain broken at seq 1/);
  rmSync(dir, { recursive: true, force: true });
});

test("two bills of lading cannot hold one code, and a refused bill never reaches the ledger", () => {
  const dir = scratchDir();
  const registry = new Registry(dir);
  registry.append(bill(1));
  assert.throws(() => registry.append({ ...bill(2), code: "code1X" }), /two bills of lading for code1X/);
  assert.equal(registry.size, 1);
  assert.equal(new Registry(dir).size, 1, "the ledger on disk holds only the accepted bill");
  rmSync(dir, { recursive: true, force: true });
});

test("a ledger that holds two bills for one code is refused when it opens", () => {
  const dir = scratchDir();
  const one = new Registry(dir).append(bill(1));
  const body = {
    seq: 2, idem: "idem-2", code: "code1X", url: "https://example.com/2/cargo",
    payload: 2, salt: 0, derive: "hex", encode: "table", prev: one.hash,
  };
  // A forgery that is chain-valid all the way down, so only the uniqueness rule can refuse it.
  appendFileSync(join(dir, "ledger.jsonl"), `${JSON.stringify({ ...body, hash: digest(JSON.stringify(body)) })}\n`);
  assert.throws(() => new Registry(dir), /two bills of lading for code1X/);
  rmSync(dir, { recursive: true, force: true });
});
