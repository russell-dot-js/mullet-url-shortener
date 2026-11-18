import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.mjs";

export function scratchDir() {
  return mkdtempSync(join(tmpdir(), "mullet-test-"));
}

export async function openApp(options = {}) {
  const dataDir = scratchDir();
  const app = await createApp({ dataDir, ...options });
  return {
    app,
    dataDir,
    async close() {
      await app.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export async function shorten(app, url) {
  const response = await app.handle("POST", "/shorten", JSON.stringify({ url }));
  return { status: response.status, headers: response.headers, body: JSON.parse(response.body) };
}
