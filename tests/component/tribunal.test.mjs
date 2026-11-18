import { test } from "node:test";
import assert from "node:assert/strict";
import STATUTE from "../../src/generated/statute-book.mjs";
import { hearCase } from "../../src/tribunal.mjs";
import { constitution } from "../../src/config.mjs";

// A hearing that carries unless it is told to show a shortfall. Used to test the chain in isolation.
const hearing = (title, shortfall) => ({
  title, office: "Test Office", mandate: "test mandate", finding: "test finding",
  underwriters: [{ present: () => ({ shortfall, authorized: 1 }) }],
  sit(clerk, treasury, previousSeal) {
    const motion = clerk.takeRoll(this, previousSeal);
    const disposition = motion.carried ? clerk.enact(this, treasury) : clerk.remand(this, treasury);
    return { motion, disposition };
  },
});

test("the statute book holds the chartered number of hearings, each syndicated to every franchise", () => {
  assert.equal(STATUTE.length, constitution.layers);
  for (const article of STATUTE) {
    assert.equal(article.underwriters.length, constitution.franchises.length);
    assert.equal(typeof article.sit, "function");
  }
});

test("sits every hearing in the statute, in order, and counts each one", () => {
  const verdict = hearCase({ valid: true, riskGrade: 12, appealDepth: 2 });
  assert.equal(verdict.hearingsTraversed, constitution.layers);
  assert.equal(verdict.motions.length, constitution.layers);
  assert.deepEqual(verdict.motions.map((motion) => motion.title), STATUTE.map((article) => article.title));
});

test("a valid case is discharged on the first attempt, every hearing carried, the books reconciled", () => {
  const verdict = hearCase({ valid: true, riskGrade: 12 });
  assert.equal(verdict.discharged, true);
  assert.equal(verdict.attempts, 1);
  assert.ok(verdict.motions.every((motion) => motion.carried));
  assert.equal(verdict.reconciliation.ok, true);
  assert.equal(verdict.docket.length, constitution.layers);
});

test("an invalid case is remanded and appealed to the depth allowed, each appeal re-hearing the full statute", () => {
  const verdict = hearCase({ valid: false, appealDepth: 2 });
  assert.equal(verdict.discharged, false);
  assert.equal(verdict.attempts, 3);
  assert.equal(verdict.hearingsTraversed, 3 * constitution.layers);
  assert.equal(verdict.reconciliation.ok, true);
});

test("the same case yields the same motions: the hearings are deterministic", () => {
  const first = hearCase({ valid: true, riskGrade: 40 });
  const second = hearCase({ valid: true, riskGrade: 40 });
  assert.deepEqual(first.motions, second.motions);
  assert.deepEqual(first.balances, second.balances);
});

test("one shortfall upstream remands every hearing downstream, even one that would carry alone", () => {
  const verdict = hearCase({
    valid: true,
    statute: [hearing("first", 0), hearing("second", 1), hearing("third", 0)],
    appealDepth: 0,
  });
  assert.deepEqual(verdict.motions.map((motion) => motion.carried), [true, false, false]);
  assert.equal(verdict.discharged, false);
});
