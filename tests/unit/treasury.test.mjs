import { test } from "node:test";
import assert from "node:assert/strict";
import { CHART, SEED, Treasury } from "../../src/treasury.mjs";

const terms = { serial: 1, debit: "applicant", credit: "mutual" };

test("a cleared fee leaves the debit account, withholds the escrow share and credits the rest", () => {
  const book = new Treasury({ escrowPercent: 40 });
  assert.deepEqual(book.clear(terms, 50, 50), { demanded: 50, authorized: 50, shortfall: 0, withheld: 20 });
  assert.equal(book.balance("applicant"), SEED - 50);
  assert.equal(book.balance("escrow"), SEED + 20);
  assert.equal(book.balance("mutual"), SEED + 30);
  assert.ok(book.reconcile().ok);
});

test("a partial authorization reports its shortfall instead of hiding it", () => {
  const book = new Treasury({ escrowPercent: 40 });
  assert.equal(book.clear(terms, 50, 20).shortfall, 30);
});

test("overdraws and impossible authorizations are refused before anything is posted", () => {
  const book = new Treasury();
  assert.throws(() => book.clear(terms, SEED + 1, SEED + 1), /overdraw refused on applicant/);
  assert.throws(() => book.clear(terms, 5, 6), /overdraw refused/);
  assert.throws(() => book.clear(terms, 5, -1), /overdraw refused/);
  assert.equal(book.balance("applicant"), SEED);
  assert.equal(book.reconcile().postings, 0);
});

test("settlement releases withheld fees to the treasury on discharge and back to the applicant on remand", () => {
  const discharged = new Treasury();
  discharged.clear(terms, 100, 100);
  assert.deepEqual(discharged.settle(true), { to: "treasury", amount: 40 });
  assert.equal(discharged.balance("escrow"), SEED);
  assert.equal(discharged.balance("treasury"), SEED + 40);
  assert.ok(discharged.reconcile().ok);

  // On remand the applicant gets the withheld 40 back; the 60 already cleared to the underwriter stays earned.
  const remanded = new Treasury();
  remanded.clear(terms, 100, 100);
  assert.deepEqual(remanded.settle(false), { to: "applicant", amount: 40 });
  assert.equal(remanded.balance("applicant"), SEED - 60);
  assert.equal(remanded.balance("mutual"), SEED + 60);
  assert.equal(remanded.balance("escrow"), SEED);
  assert.ok(remanded.reconcile().ok);
});

test("the chart is closed: unknown accounts are refused and every entry balances", () => {
  const book = new Treasury();
  assert.throws(() => book.balance("offshore"), /no account named offshore/);
  for (let serial = 1; serial <= 50; serial++) {
    book.clear({ serial, debit: CHART[serial % 5], credit: CHART[(serial + 2) % 5] }, serial, serial);
  }
  const books = book.reconcile();
  assert.equal(books.ok, true);
  assert.equal(books.unbalanced, 0);
  assert.equal(books.entries, 50);
  assert.equal(books.total, books.seeded);
});

test("the docket records what the clerk was told to record", () => {
  const book = new Treasury();
  book.record("enacted", "Inquest into the Lisbon bakery before Registrar of Short Codes");
  assert.deepEqual(book.docket, [{ kind: "enacted", title: "Inquest into the Lisbon bakery before Registrar of Short Codes" }]);
});
