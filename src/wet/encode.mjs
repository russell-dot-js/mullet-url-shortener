// Operation: write a register payload as five base-62 characters, most significant first.
// Three independent routes: repeated division, a power table, and BigInt digit extraction.
import { ALPHABET, BASE, WIDTH, assertPayload } from "./contract.mjs";

const POWERS = [BASE ** 4, BASE ** 3, BASE ** 2, BASE, 1];

export const encode = {
  divmod(payload) {
    assertPayload(payload);
    const out = new Array(WIDTH);
    let rest = payload;
    for (let index = WIDTH - 1; index >= 0; index--) {
      out[index] = ALPHABET[rest % BASE];
      rest = Math.floor(rest / BASE);
    }
    return out.join("");
  },
  table(payload) {
    assertPayload(payload);
    let text = "";
    for (const power of POWERS) text += ALPHABET[Math.floor(payload / power) % BASE];
    return text;
  },
  reduce(payload) {
    assertPayload(payload);
    let rest = BigInt(payload);
    const chars = [];
    for (let index = 0; index < WIDTH; index++) {
      chars.push(ALPHABET[Number(rest % 62n)]);
      rest /= 62n;
    }
    return chars.reverse().join("");
  },
};
