// The Shortening operation. Route draws happen before the transaction opens. The idempotency key is the
// digest of the canonical cargo, so a retried request replays the same bill of lading and writes nothing new.
import { pick, ROUTES } from "./wet/index.mjs";
import { ALPHABET } from "./wet/contract.mjs";
import { CODE_LENGTH } from "./codes.mjs";
import { digest } from "./registry.mjs";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const MAX_CARGO_LENGTH = 2048;

// The Port Authority accepts only http and https cargo, and canonicalizes it before anything else happens.
export function acceptBillOfLading(raw) {
  if (typeof raw !== "string" || raw.trim() === "") throw new HttpError(400, "The bill of lading names no cargo.");
  if (raw.trim().length > MAX_CARGO_LENGTH) throw new HttpError(413, "The cargo exceeds the port's maximum length.");
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new HttpError(400, "The bill of lading does not name a port: the URL is malformed.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HttpError(400, "Only http and https cargo may be discharged here.");
  }
  return parsed.href;
}

export class Shortener {
  #registry;
  #mint;
  #base;
  #appealDepth;
  #pins;
  #random;
  #routes;

  constructor({ registry, mint, base, appealDepth = 2, pins = {}, random = Math.random, routes = ROUTES }) {
    this.#registry = registry;
    this.#mint = mint;
    this.#base = base;
    this.#appealDepth = appealDepth;
    this.#pins = pins;
    this.#random = random;
    this.#routes = routes;
  }

  async shorten(raw, file) {
    const url = acceptBillOfLading(raw);
    const idem = digest(url);
    const options = { pins: this.#pins, random: this.#random, routes: this.#routes };
    const derive = pick("derive", options);
    const encode = pick("encode", options);
    file.routes({
      derive: derive.name,
      encode: encode.name,
      pinned: { derive: this.#pins.derive !== undefined, encode: this.#pins.encode !== undefined },
    });

    const replay = this.#registry.byIdem(idem);
    if (replay) {
      file.note(`replay: ${replay.code} already holds this cargo; nothing new is written`);
      return { status: 200, entry: replay };
    }

    const shortLength = this.#base.length + CODE_LENGTH;
    if (shortLength >= url.length) {
      throw new HttpError(422, `The Compression Office declines: a ${shortLength}-character short form would be no shorter than this ${url.length}-character cargo.`);
    }

    for (let salt = 0; salt <= this.#appealDepth; salt++) {
      const payload = derive.run(url, salt);
      const digits = encode.run(payload);
      const check = await this.#mint.checkIndex(payload);
      const code = digits + ALPHABET[check];
      const holder = this.#registry.byCode(code);
      if (holder) {
        file.note(`jurisdictional collision at salt ${salt}: ${code} is already held; appealing`);
        continue;
      }
      const entry = this.#registry.append({ idem, code, url, payload, salt, derive: derive.name, encode: encode.name });
      file.note(`registered ${code} at salt ${salt}`);
      return { status: 201, entry };
    }
    throw new HttpError(409, "Remanded: every appeal to the register has been exhausted; no code can be issued.");
  }
}
