// The redirects topic: partitioned by a stable business key, with consumer groups that own their offsets.
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCompleteLines } from "./durable.mjs";

export class Topic {
  #file;
  #logs;
  #nextId = 1;

  constructor({ dir, name, partitions }) {
    mkdirSync(dir, { recursive: true });
    this.name = name;
    this.partitions = partitions;
    this.#file = join(dir, `${name}.jsonl`);
    this.#logs = Array.from({ length: partitions }, () => []);
    for (const line of readCompleteLines(this.#file).lines) {
      const record = JSON.parse(line);
      this.#logs[record.partition].push(record);
      this.#nextId = record.id + 1;
    }
  }

  partitionFor(key) {
    return createHash("sha256").update(key).digest().readUInt32BE(0) % this.partitions;
  }

  publish(key, value) {
    const record = { id: this.#nextId++, partition: this.partitionFor(key), key, value };
    appendFileSync(this.#file, `${JSON.stringify(record)}\n`);
    this.#logs[record.partition].push(record);
    return record;
  }

  fetch(partition, offset) {
    return this.#logs[partition].slice(offset);
  }
}

// At-least-once delivery. The offset is committed only after the handler returns, so a throwing handler
// leaves the record to be redelivered on the next poll.
export class ConsumerGroup {
  #topic;
  #file;
  #offsets;

  constructor({ topic, name, dir }) {
    mkdirSync(dir, { recursive: true });
    this.#topic = topic;
    this.name = name;
    this.#file = join(dir, `offsets-${name}.json`);
    this.#offsets = existsSync(this.#file)
      ? JSON.parse(readFileSync(this.#file, "utf8"))
      : new Array(topic.partitions).fill(0);
  }

  get offsets() { return [...this.#offsets]; }

  poll(handle) {
    let delivered = 0;
    for (let partition = 0; partition < this.#topic.partitions; partition++) {
      for (const record of this.#topic.fetch(partition, this.#offsets[partition])) {
        handle(record);
        this.#offsets[partition] += 1;
        writeFileSync(this.#file, JSON.stringify(this.#offsets));
        delivered += 1;
      }
    }
    return delivered;
  }
}
