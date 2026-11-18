// Builds everything that is generated or compiled: the statute book, the Mint sheet, Mint.class and Relay.class.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

mkdirSync("src/generated", { recursive: true });
mkdirSync("build/jvm", { recursive: true });
run(process.execPath, ["scripts/charter.mjs", "constitution.json", "src/generated/statute-book.mjs"]);
run(process.execPath, ["scripts/engrave.mjs", "jvm/Mint.j"]);
run(process.execPath, ["scripts/jasm.mjs", "jvm/Mint.j", "build/jvm/Mint.class"]);
run("javac", ["-cp", "build/jvm", "-d", "build/jvm", "jvm/Relay.java"]);
console.log("build: statute book, Mint sheet, Mint.class and Relay.class are current");
