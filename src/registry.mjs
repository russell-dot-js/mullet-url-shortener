// The register: an append-only, hash-chained ledger of bills of lading (local-log broker).
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readCompleteLines } from "./durable.mjs";

export const GENESIS = "0".repeat(64);
export const digest = (text) => createHash("sha256").update(text).digest("hex");

export class Registry {
  #file;
  #entries = [];
  #byCode = new Map();
  #byPayload = new Map();
  #byIdem = new Map();
  #head = GENESIS;
  #recovered;

  constructor(dir) {
    mkdirSync(dir, { recursive: true });
    this.#file = join(dir, "ledger.jsonl");
    const { lines, recovered } = readCompleteLines(this.#file);
    this.#recovered = recovered;
    for (const line of lines) this.#accept(JSON.parse(line));
  }

  get recovered() { return this.#recovered; }
  get size() { return this.#entries.length; }
  get head() { return this.#head; }
  byCode(code) { return this.#byCode.get(code); }
  // The register is keyed by payload. The check character is the JVM's to vouch for, not the register's.
  byPayload(payload) { return this.#byPayload.get(payload); }
  byIdem(idem) { return this.#byIdem.get(idem); }

  append({ idem, code, url, payload, salt, derive, encode }) {
    // Refused before anything touches the disk: a rejected bill must never reach the ledger.
    this.#refuseDuplicate(code, payload);
    const body = { seq: this.#entries.length + 1, idem, code, url, payload, salt, derive, encode, prev: this.#head };
    const entry = { ...body, hash: digest(JSON.stringify(body)) };
    appendFileSync(this.#file, `${JSON.stringify(entry)}\n`);
    this.#accept(entry);
    return entry;
  }

  #refuseDuplicate(code, payload) {
    if (this.#byCode.has(code)) throw new Error(`ledger holds two bills of lading for ${code}`);
    if (this.#byPayload.has(payload)) throw new Error(`ledger holds two bills of lading for payload ${payload}`);
  }

  #accept(entry) {
    const { hash, ...body } = entry;
    if (body.prev !== this.#head || body.seq !== this.#entries.length + 1 || digest(JSON.stringify(body)) !== hash) {
      throw new Error(`ledger chain broken at seq ${entry.seq}`);
    }
    this.#refuseDuplicate(entry.code, entry.payload);
    this.#entries.push(entry);
    this.#byCode.set(entry.code, entry);
    this.#byPayload.set(entry.payload, entry);
    this.#byIdem.set(entry.idem, entry);
    this.#head = hash;
  }
}
