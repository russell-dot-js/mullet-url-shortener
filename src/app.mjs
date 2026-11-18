// The application: wires the register, the broker, the Mint, the shortener and the tribunal behind one entry point.
// handle() takes a method, a request target and a body, and returns { status, headers, body }. No HTTP lives here.
import { join } from "node:path";
import { resolveConfig } from "./config.mjs";
import { Registry } from "./registry.mjs";
import { Topic, ConsumerGroup } from "./topic.mjs";
import { Shortener, HttpError } from "./shortener.mjs";
import { CaseBook } from "./casefile.mjs";
import { hearCase } from "./tribunal.mjs";
import { isWellFormed, decodePayload } from "./codes.mjs";
import { ALPHABET, WIDTH } from "./wet/contract.mjs";
import { ROUTES } from "./wet/index.mjs";
import { Mint } from "./mint.mjs";
import STATUTE from "./generated/statute-book.mjs";

const HELP = `Mullet URL Shortener: a bill of lading for every link.
POST /shorten          {"url": "https://..."}  register cargo, receive a short code
GET  /<code>                                   discharge the cargo (302) after the hearings
GET  /<code>?case                              the docket for that hearing
GET  /_cases/<id>                              the docket for any case on the record
GET  /_healthz                                 port status
`;

const text = (status, body, headers = {}) => ({
  status, headers: { "content-type": "text/plain; charset=utf-8", ...headers }, body,
});
const json = (status, value, headers = {}) => ({
  status, headers: { "content-type": "application/json; charset=utf-8", ...headers }, body: `${JSON.stringify(value)}\n`,
});

export async function createApp(options = {}) {
  const config = resolveConfig(options);
  const brokerDir = join(config.dataDir, "broker");
  const registry = new Registry(join(config.dataDir, "ledger"));
  const topic = new Topic({ dir: brokerDir, name: "redirects", partitions: config.partitions });
  const audit = new ConsumerGroup({ topic, name: "audit", dir: brokerDir });
  const analytics = new ConsumerGroup({ topic, name: "analytics", dir: brokerDir });
  const auditTrail = [];
  const discharges = new Map();
  const counted = new Set();
  const ownsMint = options.mint === undefined;
  const mint = options.mint ?? (await Mint.start({ java: config.java, classes: config.classes }));
  const shortener = new Shortener({
    registry, mint, base: config.base, appealDepth: config.appealDepth,
    pins: config.pins, random: config.random, routes: options.routes ?? ROUTES,
  });
  const cases = new CaseBook();

  // Liturgical consistency: consumers catch up at the next ritual tick, which is the start of the next request.
  function tick() {
    audit.poll((record) => auditTrail.push(record));
    analytics.poll((record) => {
      if (counted.has(record.id)) return;
      counted.add(record.id);
      if (record.value.kind === "discharged") discharges.set(record.key, (discharges.get(record.key) ?? 0) + 1);
    });
  }

  async function handle(method, target, body = "") {
    tick();
    const url = new URL(target, "http://mullet.invalid");
    const file = cases.open(method, `${url.pathname}${url.search}`);
    try {
      const response = await dispatch(method, url, body, file);
      return { ...response, headers: { ...response.headers, "x-mullet-case": file.id } };
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      file.outcome(`refused ${error.status}: ${error.message}`);
      const headers = { "x-mullet-case": file.id };
      return url.pathname === "/shorten"
        ? json(error.status, { error: error.message, case: file.id }, headers)
        : text(error.status, `${error.message}\n`, headers);
    }
  }

  async function dispatch(method, url, body, file) {
    const path = url.pathname;
    if (method !== "GET" && method !== "POST") {
      return text(405, "Only GET and POST are heard at this port.\n", { allow: "GET, POST" });
    }
    if (method === "POST") {
      return path === "/shorten" ? shorten(body, file) : text(404, "No such filing at this port.\n");
    }
    if (path === "/") return text(200, HELP);
    if (path === "/_healthz") {
      return json(200, {
        status: "ok", hearingsPerAttempt: STATUTE.length, appealDepth: config.appealDepth,
        ledger: registry.size, jvm: "custody held",
      });
    }
    if (path.startsWith("/_cases/")) {
      const docket = cases.render(path.slice("/_cases/".length));
      return docket === undefined ? text(404, "No such case on the docket.\n") : text(200, docket);
    }
    if (path.length > 1 && !path.slice(1).includes("/")) return discharge(url, path.slice(1), file);
    return text(404, "No such page at this port.\n");
  }

  async function shorten(body, file) {
    if (!body) throw new HttpError(400, "The bill of lading names no cargo.");
    let request;
    try {
      request = JSON.parse(body);
    } catch {
      throw new HttpError(400, "The bill of lading is not JSON.");
    }
    if (request === null || typeof request !== "object") throw new HttpError(400, "The bill of lading names no cargo.");
    const { status, entry } = await shortener.shorten(request.url, file);
    if (status === 201) topic.publish(entry.code, { kind: "shortened", code: entry.code });
    file.outcome(status === 201 ? `registered ${entry.code}` : `replayed ${entry.code}`);
    return json(status, {
      code: entry.code, short: config.base + entry.code, url: entry.url, replayed: status === 200, case: file.id,
    });
  }

  async function discharge(url, code, file) {
    if (!isWellFormed(code)) {
      file.outcome("refused at the front door: not a bill of lading");
      return text(404, "Refused at the front door: this is not a bill of lading.\n");
    }
    const payload = decodePayload(code.slice(0, WIDTH));
    const check = ALPHABET.indexOf(code[WIDTH]);
    const stamped = await mint.verdict(payload, check);
    const entry = registry.byPayload(payload);
    file.jvm({ payload, check, stamped });
    const hearing = hearCase({
      valid: stamped && entry !== undefined,
      riskGrade: entry ? entry.url.length : 0,
      appealDepth: config.appealDepth,
      escrowPercent: config.escrowPercent,
    });
    file.tribunal(hearing, entry?.url);
    // An inspection re-runs the hearing so the docket can be called again. It is not a discharge, so analytics must not count it.
    const kind = url.searchParams.has("case") ? "inspected" : hearing.discharged ? "discharged" : "remanded";
    topic.publish(code, { kind, code, case: file.id });

    if (url.searchParams.has("case")) {
      file.outcome(hearing.discharged ? `discharged to ${entry.url} (302, docket only)` : "remanded (docket only)");
      return text(200, file.render());
    }
    if (hearing.discharged) {
      file.outcome(`discharged to ${entry.url} (302)`);
      return text(302, `Discharged at the port: ${entry.url}\n`, { location: entry.url, "cache-control": "no-store" });
    }
    const reason = !stamped
      ? "the JVM refused custody of this bill of lading's check digit"
      : entry === undefined
        ? "no cargo is registered under this bill of lading"
        : "the tribunal remanded the cargo";
    file.outcome(`remanded: ${reason}`);
    return text(404, `Remanded: ${reason}.\n`);
  }

  return {
    handle,
    flush: tick,
    registry,
    topic,
    discharges,
    auditTrail,
    config,
    async close() {
      if (ownsMint) mint.close();
    },
  };
}
