// The clerk takes the roll. For each hearing it collects the underwriters' presentments and decides whether
// the motion carries. A motion carries only if the case is valid, every fee cleared in full and the
// previous hearing carried.
const bytes = (text) => Buffer.byteLength(text, "utf8");

export class Clerk {
  #valid;
  #riskGrade;
  #treasury;
  #motions = [];

  constructor({ valid, riskGrade = 0, treasury }) {
    this.#valid = valid;
    this.#riskGrade = riskGrade;
    this.#treasury = treasury;
  }

  get motions() { return this.#motions.slice(); }

  takeRoll(article, previousSeal) {
    const evidence = {
      docketPosition: this.#motions.length + 1,
      riskGrade: this.#riskGrade,
      officeBytes: bytes(article.office),
      mandateBytes: bytes(article.mandate),
      findingBytes: bytes(article.finding),
    };
    const presentments = (article.underwriters ?? []).map((underwriter) => underwriter.present(this.#treasury, evidence));
    const shortfall = presentments.reduce((sum, presented) => sum + presented.shortfall, 0);
    const fees = presentments.reduce((sum, presented) => sum + presented.authorized, 0);
    const chained = previousSeal === undefined || previousSeal.motion.carried;
    const motion = {
      position: evidence.docketPosition,
      title: article.title,
      underwriters: presentments.length,
      fees,
      shortfall,
      carried: this.#valid && shortfall === 0 && chained,
    };
    this.#motions.push(motion);
    return motion;
  }

  enact(article, treasury) {
    treasury.record("enacted", article.title);
    return { disposition: "enacted" };
  }

  remand(article, treasury) {
    treasury.record("remanded", article.title);
    return { disposition: "remanded" };
  }
}
