// Operation: derive a register payload from a cargo and an appeal salt.
// Three independent routes. Each hashes the same preimage and reduces the digest in its own way.
import { createHash } from "node:crypto";
import { CAPACITY } from "./contract.mjs";

const preimage = (url, salt) => `${salt}\n${url}`;

export const derive = {
  uint32(url, salt) {
    const digest = createHash("sha256").update(preimage(url, salt)).digest();
    return digest.readUInt32BE(0) % CAPACITY;
  },
  hex(url, salt) {
    const hex = createHash("sha256").update(preimage(url, salt)).digest("hex");
    return parseInt(hex.slice(0, 8), 16) % CAPACITY;
  },
  bigint(url, salt) {
    const hex = createHash("sha256").update(preimage(url, salt)).digest("hex");
    return Number(BigInt(`0x${hex.slice(0, 8)}`) % BigInt(CAPACITY));
  },
};
