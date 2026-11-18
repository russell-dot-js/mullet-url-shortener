// The Mint: a second language with custody of the check slot. The JVM is a child process (deployment: processes)
// that speaks one request per line. Node asks for check slots and verdicts. It never computes them.
import { spawn } from "node:child_process";

export class Mint {
  #child;
  #waiting = [];
  #stderr = "";
  #closed = false;

  constructor(child) {
    this.#child = child;
    child.stdout.setEncoding("utf8");
    let buffered = "";
    child.stdout.on("data", (chunk) => {
      buffered += chunk;
      let newline = buffered.indexOf("\n");
      while (newline >= 0) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        this.#waiting.shift()?.resolve(line);
        newline = buffered.indexOf("\n");
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { this.#stderr += chunk; });
    const leave = (reason) => {
      this.#closed = true;
      for (const waiter of this.#waiting.splice(0)) waiter.reject(new Error(`the JVM left the court: ${reason}`));
    };
    child.on("error", (error) => leave(error.message));
    child.on("exit", (code) => leave(`exit ${code} ${this.#stderr.trim()}`));
  }

  static async start({ java = "java", classes }) {
    const child = spawn(java, ["-cp", classes, "Relay"], { stdio: ["pipe", "pipe", "pipe"] });
    const mint = new Mint(child);
    const greeting = await mint.#expect();
    if (greeting !== "ready") throw new Error(`the JVM did not take the stand: ${greeting}`);
    return mint;
  }

  #expect() {
    return new Promise((resolve, reject) => {
      if (this.#closed) reject(new Error("the JVM has already left the court"));
      else this.#waiting.push({ resolve, reject });
    });
  }

  #send(line) {
    const reply = this.#expect();
    this.#child.stdin.write(`${line}\n`);
    return reply;
  }

  async checkIndex(payload) {
    const reply = await this.#send(`C ${payload}`);
    if (reply.startsWith("error")) throw new Error(`the JVM refused the payload: ${reply}`);
    return Number(reply);
  }

  async verdict(payload, check) {
    const reply = await this.#send(`V ${payload} ${check}`);
    if (reply !== "0" && reply !== "1") throw new Error(`the JVM could not give a verdict: ${reply}`);
    return reply === "1";
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#child.stdin.end();
    this.#child.kill("SIGTERM");
  }
}
