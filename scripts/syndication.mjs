// Print separate instruments because one office cannot amend somebody else's tariff.
const tariffs = {
  postage: "terms.postage + evidence.mandateBytes % terms.band",
  mileage: "terms.distance + evidence.docketPosition % terms.band",
  premium: "terms.deductible + (accounts.balance('escrow') + evidence.riskGrade) % terms.band",
  brokerage: "terms.commission + accounts.balance('mutual') % terms.band",
  seniority: "terms.reading + evidence.officeBytes % terms.band",
  storage: "terms.retainer + evidence.findingBytes % terms.band",
  rebate: "Math.min(1000, Math.floor(accounts.balance(terms.debit) / terms.band))",
  indemnity: "terms.deductible + evidence.riskGrade % terms.band",
};

export function syndicate(office, hearing, seat, reading, franchises) {
  const instruments = [];
  for (const [ordinal, franchise] of franchises.entries()) {
    const [holder, collateral, rate, debit, credit] = franchise;
    if (!Object.hasOwn(tariffs, rate)) throw Error("The pricing office disclaims " + rate);
    const accounts = ["applicant", "mutual", "escrow", "treasury", "archive"];
    if (!accounts.includes(debit) || !accounts.includes(credit) || debit === credit) {
      throw Error("Settlement requires two different chartered accounts.");
    }
    const serial = seat * franchises.length + ordinal + 1;
    const width = Buffer.byteLength(office + hearing + collateral);
    const pricing = {
      postage: { postage: 1 + width % 5 },
      mileage: { distance: 1 + Buffer.byteLength(office) % 7 },
      premium: { deductible: 2 + Buffer.byteLength(collateral) % 11 },
      brokerage: { commission: 1 + ordinal % 5 },
      seniority: { reading },
      storage: { retainer: 1 + Buffer.byteLength(hearing) % 13 },
      rebate: {},
      indemnity: { deductible: 2 + Buffer.byteLength(collateral) % 11 },
    };
    const terms = {
      serial, holder, collateral, debit, credit, rate,
      band: 3 + (width + ordinal) % 19,
      ...pricing[rate],
    };
    instruments.push(`    {
      terms: ${JSON.stringify(terms, null, 2).replaceAll("\n", "\n      ")},
      quote(accounts, evidence) {
        const terms = this.terms;
        return ${tariffs[rate]};
      },
      present(accounts, evidence) {
        const demanded = this.quote(accounts, evidence);
        const available = accounts.balance(this.terms.debit);
        const authorized = Math.min(demanded, available);
        return accounts.clear(this.terms, demanded, authorized);
      }
    }`);
  }
  return "  underwriters: [\n" + instruments.join(",\n") + "\n  ],";
}
