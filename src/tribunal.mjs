// The Redirect Tribunal. Every discharge is a request for a scarce right: the cargo must survive every
// hearing in the statute book, in order, or it is remanded. A remand is appealed up to appealDepth times.
import STATUTE from "./generated/statute-book.mjs";
import { Clerk } from "./clerk.mjs";
import { Treasury } from "./treasury.mjs";

export function hearCase({ valid, riskGrade = 0, appealDepth = 2, escrowPercent = 40, statute = STATUTE }) {
  const appeals = [];
  let final = null;
  for (let attempt = 1; attempt <= appealDepth + 1; attempt++) {
    const treasury = new Treasury({ escrowPercent });
    const clerk = new Clerk({ valid, riskGrade, treasury });
    let seal;
    for (const article of statute) seal = article.sit(clerk, treasury, seal);
    const motions = clerk.motions;
    const discharged = motions.length > 0 && motions.every((motion) => motion.carried);
    const settlement = treasury.settle(discharged);
    appeals.push({ attempt, hearings: motions.length, carried: motions.filter((motion) => motion.carried).length, discharged });
    final = { discharged, motions, treasury, settlement };
    if (discharged) break;
  }
  return {
    discharged: final.discharged,
    attempts: appeals.length,
    hearingsPerAttempt: statute.length,
    hearingsTraversed: appeals.reduce((sum, appeal) => sum + appeal.hearings, 0),
    motions: final.motions,
    settlement: final.settlement,
    reconciliation: final.treasury.reconcile(),
    balances: final.treasury.balances(),
    docket: final.treasury.docket,
    appeals,
  };
}
