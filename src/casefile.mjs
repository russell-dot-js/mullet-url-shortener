// The docket. Every request opens a case. The case file records what was drawn, what the JVM stamped,
// what the tribunal heard, and where the money ended up. Facts are recorded so a witness can be called again.
export class CaseFile {
  constructor(id, method, target) {
    this.id = id;
    this.method = method;
    this.target = target;
    this.routeLog = null;
    this.jvmLog = null;
    this.tribunalLog = null;
    this.notes = [];
    this.result = "in progress";
  }

  routes(routes) { this.routeLog = routes; }
  jvm(custody) { this.jvmLog = custody; }
  tribunal(hearing, cargo) { this.tribunalLog = { ...hearing, cargo }; }
  note(text) { this.notes.push(text); }
  outcome(text) { this.result = text; }

  render() {
    const out = [`CASE ${this.id} — ${this.method} ${this.target}`];
    if (this.routeLog) {
      const { derive, encode, pinned } = this.routeLog;
      out.push(`Routes drawn: derive=${derive}${pinned.derive ? " (pinned)" : ""}, encode=${encode}${pinned.encode ? " (pinned)" : ""}`);
    }
    if (this.jvmLog) {
      const { payload, check, stamped } = this.jvmLog;
      out.push(`Custody: check slot ${check} for payload ${payload}; the JVM ${stamped ? "stamped the bill" : "refused the bill"}`);
    }
    const hearing = this.tribunalLog;
    if (hearing) {
      if (hearing.cargo) out.push(`Cargo: ${hearing.cargo}`);
      const carried = hearing.motions.filter((motion) => motion.carried).length;
      const plural = hearing.attempts === 1 ? "" : "s";
      out.push(`Hearings traversed: ${hearing.hearingsTraversed} (${hearing.hearingsPerAttempt} per attempt, ${hearing.attempts} attempt${plural})`);
      out.push(`Final roll: ${carried} of ${hearing.motions.length} carried`);
      const books = hearing.reconciliation;
      out.push(`Treasury: ${books.ok ? "reconciled" : "OUT OF BALANCE"}; ${books.postings} postings in ${books.entries} entries; ${books.total} of ${books.seeded} units on the books`);
      out.push(`Escrow: ${hearing.settlement.amount} units settled to ${hearing.settlement.to}`);
      const notable = hearing.motions.reduce((best, motion) => (best === null || motion.fees > best.fees ? motion : best), null);
      out.push(`Notable ruling: "${notable.title}"; ${notable.carried ? "enacted" : "remanded"}, fees cleared ${notable.fees} across ${notable.underwriters} underwriters`);
      const distinct = new Set(hearing.motions.map((motion) => motion.title)).size;
      out.push(`Minority report (the night janitor): the roll counted ${hearing.motions.length} hearings and ${distinct} distinct titles`);
      const appealed = hearing.attempts - 1;
      out.push(`Final signature: Ombudsman of Redirects, after ${appealed} appeal${appealed === 1 ? "" : "s"}`);
    }
    out.push(`Result: ${this.result}`);
    for (const note of this.notes) out.push(`Note: ${note}`);
    return `${out.join("\n")}\n`;
  }
}

export class CaseBook {
  #cases = new Map();
  #sequence = 0;
  #limit;

  constructor({ limit = 500 } = {}) {
    this.#limit = limit;
  }

  open(method, target) {
    this.#sequence += 1;
    const id = `C${String(this.#sequence).padStart(5, "0")}`;
    const file = new CaseFile(id, method, target);
    this.#cases.set(id, file);
    if (this.#cases.size > this.#limit) this.#cases.delete(this.#cases.keys().next().value);
    return file;
  }

  render(id) {
    return this.#cases.get(id)?.render();
  }
}
