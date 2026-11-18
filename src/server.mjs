// The front door: a thin HTTP adapter over the application. Nothing in here decides anything.
import { createServer } from "node:http";

const MAX_BODY_BYTES = 8 * 1024;

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
