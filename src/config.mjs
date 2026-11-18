import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePins } from "./wet/index.mjs";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const constitution = JSON.parse(readFileSync(join(ROOT, "constitution.json"), "utf8"));

export function resolveConfig(options = {}, env = process.env) {
  const base = options.base ?? env.MULLET_PUBLIC_BASE ?? "http://localhost:8080/";
  return {
    dataDir: options.dataDir ?? env.MULLET_DATA_DIR ?? join(ROOT, "data"),
    base: base.endsWith("/") ? base : `${base}/`,
    pins: options.pins ?? parsePins(env.MULLET_PIN ?? ""),
    random: options.random ?? Math.random,
    java: options.java ?? env.JAVA_BIN ?? "java",
    classes: options.classes ?? join(ROOT, "build", "jvm"),
    appealDepth: options.appealDepth ?? constitution.appeal_depth,
    escrowPercent: options.escrowPercent ?? constitution.escrow_percent,
    partitions: options.partitions ?? constitution.partitions,
  };
}
