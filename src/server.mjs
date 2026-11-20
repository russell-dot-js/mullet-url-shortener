// The front door: a thin HTTP adapter over the application. Nothing in here decides anything.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const MAX_BODY_BYTES = 8 * 1024;

// The browser page is static. It is read once and served before the body is touched; it only calls endpoints the application already answers.
const PAGE = readFileSync(new URL("../public/index.html", import.meta.url));
const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-cache",
  "x-content-type-options": "nosniff",
  "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) reject(new RangeError("body too large"));
      else chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

export function createHttpServer(app) {
  return createServer(async (request, response) => {
    if (request.method === "GET" && request.url.split("?")[0] === "/ui") {
      response.writeHead(200, PAGE_HEADERS);
      response.end(PAGE);
      return;
    }
    let body;
    try {
      body = await readBody(request);
    } catch {
      response.writeHead(413, { "content-type": "text/plain; charset=utf-8", connection: "close" });
      response.end("The cargo exceeds the dock's body limit.\n");
      return;
    }
    try {
      const result = await app.handle(request.method, request.url, body);
      response.writeHead(result.status, result.headers);
      response.end(result.body ?? "");
    } catch (error) {
      console.error(error);
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end("The court adjourned unexpectedly.\n");
    }
  });
}
