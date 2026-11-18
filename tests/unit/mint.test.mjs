import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Mint } from "../../src/mint.mjs";
import { assemble } from "../../scripts/jasm.mjs";
import { engrave } from "../../scripts/engrave.mjs";
import { ROOT } from "../../src/config.mjs";
import { ALPHABET, CAPACITY, oracleCheckChar, oracleCheckIndex } from "../oracle.mjs";

const classes = join(ROOT, "build", "jvm");

test("the JVM's check slot agrees with the oracle on edge payloads and a sample", async () => {
  const mint = await Mint.start({ classes });
  try {
    const payloads = [0, 1, 61, 62, 3843, CAPACITY - 1, ...Array.from({ length: 300 }, (_, i) => (i * 3000017 + 5) % CAPACITY)];
    for (const payload of payloads) {
      assert.equal(await mint.checkIndex(payload), oracleCheckIndex(payload), `slot disagrees at payload ${payload}`);
    }
  } finally {
    mint.close();
  }
});

test("the JVM gives a verdict only for the check character it issued", async () => {
  const mint = await Mint.start({ classes });
  try {
    const payload = 362542491;
    const right = ALPHABET.indexOf(oracleCheckChar(payload));
    assert.equal(await mint.verdict(payload, right), true);
    assert.equal(await mint.verdict(payload, (right + 1) % 62), false);
  } finally {
    mint.close();
  }
});

test("a malformed request to the JVM is refused in its own words", async () => {
  const mint = await Mint.start({ classes });
  try {
    await assert.rejects(mint.checkIndex("not-a-number"), /the JVM refused the payload/);
    await assert.rejects(mint.verdict(1, "x"), /could not give a verdict/);
  } finally {
    mint.close();
  }
});

test("a missing JVM is reported as the JVM leaving the court", async () => {
  await assert.rejects(Mint.start({ java: "/nonexistent/java", classes }), /left the court/);
});

test("the assembler emits a version 49 class and refuses an unknown mnemonic", () => {
  const bytes = assemble(readFileSync(join(ROOT, "jvm", "Mint.j"), "utf8"));
  assert.equal(bytes.readUInt32BE(0), 0xcafebabe);
  assert.equal(bytes.readUInt16BE(6), 49);
  assert.throws(() => assemble(".class public Bad\n.method public static f()V\n    .limit stack 1\n    .limit locals 0\n    frobnicate\n    return\n.end method\n"), /unknown mnemonic frobnicate/);
  assert.throws(() => assemble(".class public Bad\n.method public static f()V\n    .limit stack 1\n    .limit locals 0\n    goto nowhere\n    return\n.end method\n"), /undefined label nowhere/);
});

test("the Mint sheet is reproducible: engraving again yields the file on disk", () => {
  assert.equal(engrave(), readFileSync(join(ROOT, "jvm", "Mint.j"), "utf8"));
});
