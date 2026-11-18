// The account book. Double-entry inside a closed system: money moves between the five chartered accounts
// and never leaves them. Every hearing's fees are posted here and must reconcile before the case closes.
export const CHART = Object.freeze(["applicant", "mutual", "escrow", "treasury", "archive"]);
export const SEED = 10 ** 12;

export class Treasury {
  #balances = new Map();
  #journal = [];
  #docket = [];
  #escrowPercent;
  #seeded;
  #withheld = 0;

  constructor({ escrowPercent = 40, seed = SEED } = {}) {
    this.#escrowPercent = escrowPercent;
    for (const account of CHART) this.#balances.set(account, seed);
    this.#seeded = seed * CHART.length;
  }

  balance(account) {
    if (!this.#balances.has(account)) throw new RangeError(`the chart has no account named ${account}`);
    return this.#balances.get(account);
  }

  // Called by the underwriters. Withholds the escrow share of each fee pending discharge.
  clear(terms, demanded, authorized) {
    if (!(authorized >= 0 && authorized <= demanded && authorized <= this.balance(terms.debit))) {
      throw new RangeError(`overdraw refused on ${terms.debit}`);
    }
    const withheld = Math.floor((authorized * this.#escrowPercent) / 100);
    this.#post(terms.serial, terms.debit, -authorized);
    this.#post(terms.serial, "escrow", withheld);
    this.#post(terms.serial, terms.credit, authorized - withheld);
    this.#withheld += withheld;
    return { demanded, authorized, shortfall: demanded - authorized, withheld };
  }

  // Releases the withheld fees when the case closes: to the treasury on discharge, back to the applicant on remand.
  // The escrow account's own float is never touched.
  settle(discharged) {
    const to = discharged ? "treasury" : "applicant";
    const amount = this.#withheld;
    this.#withheld = 0;
    if (amount > 0) {
      this.#post("settle", "escrow", -amount);
      this.#post("settle", to, amount);
    }
    return { to, amount };
  }

  record(kind, title) {
    this.#docket.push({ kind, title });
  }

  get docket() { return this.#docket.slice(); }

  balances() {
    return Object.fromEntries(CHART.map((account) => [account, this.balance(account)]));
  }

  reconcile() {
    const byEntry = new Map();
    for (const row of this.#journal) byEntry.set(row.entry, (byEntry.get(row.entry) ?? 0) + row.amount);
    const unbalanced = [...byEntry.values()].filter((sum) => sum !== 0).length;
    const total = [...this.#balances.values()].reduce((sum, value) => sum + value, 0);
    return {
      ok: unbalanced === 0 && total === this.#seeded,
      postings: this.#journal.length,
      entries: byEntry.size,
      unbalanced,
      total,
      seeded: this.#seeded,
    };
  }

  #post(entry, account, amount) {
    this.#balances.set(account, this.#balances.get(account) + amount);
    this.#journal.push({ entry, account, amount });
  }
}
