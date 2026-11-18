import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { rmSync } from "node:fs";
import { ROOT } from "../../src/config.mjs";
import { scratchDir } from "../support.mjs";

const LONG = "https://example.com/bakery/lisbon/the-trailing-slash/recipes/pastel-de-nata";

// Starts the real process on an ephemeral port and waits for it to report the port it chose.
async function startProcess(dataDir) {
  const child = spawn(process.execPath, ["src/main.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: "0", MULLET_DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const port = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("no port reported within 30 seconds")), 30000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/listening on port (\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`the process exited before listening: ${code}`));
    });
  });
  const stop = async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
  };
  return { base: `http://127.0.0.1:${port}`, stop };
}

test("the real process shortens, redirects and turns away strangers over HTTP", async () => {
  const dataDir = scratchDir();
  const server = await startProcess(dataDir);
  try {
    const created = await fetch(`${server.base}/shorten`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: LONG }),
    });
    assert.equal(created.status, 201);
    const { code } = await created.json();

    const redirect = await fetch(`${server.base}/${code}`, { redirect: "manual" });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get("location"), LONG);

    assert.equal((await fetch(`${server.base}/zzzzzz`, { redirect: "manual" })).status, 404);
  } finally {
    await server.stop();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test("the register survives a restart: a code issued before the restart still discharges after it", async () => {
  const dataDir = scratchDir();
  const first = await startProcess(dataDir);
  let code;
  try {
    const created = await fetch(`${first.base}/shorten`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: LONG }),
    });
    code = (await created.json()).code;
  } finally {
    await first.stop();
  }
  const second = await startProcess(dataDir);
  try {
    const redirect = await fetch(`${second.base}/${code}`, { redirect: "manual" });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get("location"), LONG);
  } finally {
    await second.stop();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
