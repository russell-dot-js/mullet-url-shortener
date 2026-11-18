// The oracle states what the customer is owed. It shares no logic with src/: each digit is found by bracketing
// rather than dividing, and the check is folded by hand. It shares only the published alphabet and check table.
import { createHash } from "node:crypto";
import { permutation } from "../scripts/engrave.mjs";

export const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const CAPACITY = 62 ** 5;
const SLOTS = permutation();

export function oracleDerive(url, salt) {
  const hex = createHash("sha256").update(`${salt}\n${url}`).digest("hex");
  return parseInt(hex.slice(0, 8), 16) % CAPACITY;
}

export function oracleEncode(payload) {
  let remaining = payload;
  let text = "";
  for (let place = 4; place >= 0; place--) {
    const weight = 62 ** place;
    let digit = 0;
    while ((digit + 1) * weight <= remaining) digit++;
    remaining -= digit * weight;
    text += ALPHABET[digit];
  }
  return text;
}

// The fold runs over the significant digits, least significant first, as the sheet's loop does.
export function oracleCheckIndex(payload) {
  const significant = oracleEncode(payload).replace(/^0+/, "");
  let fold = 0;
  for (const character of [...significant].reverse()) fold = fold * 3 + ALPHABET.indexOf(character);
  return SLOTS[(fold * 7 + 11) % 62];
}

export const oracleCheckChar = (payload) => ALPHABET[oracleCheckIndex(payload)];
