// Short codes: WIDTH characters of register payload followed by one check character issued by the JVM.
import { ALPHABET, BASE, WIDTH } from "./wet/contract.mjs";

export const CODE_LENGTH = WIDTH + 1;
const WELL_FORMED = new RegExp(`^[0-9A-Za-z]{${CODE_LENGTH}}$`);

export const isWellFormed = (code) => WELL_FORMED.test(code);

export function decodePayload(digits) {
  let payload = 0;
  for (const character of digits) {
    const value = ALPHABET.indexOf(character);
    if (value < 0) throw new RangeError(`not a register character: ${character}`);
    payload = payload * BASE + value;
  }
  return payload;
}
