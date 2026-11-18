import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { ConsumerGroup, Topic } from "../../src/topic.mjs";
import { scratchDir } from "../support.mjs";

test("keys route to stable partitions within the configured count", () => {
  const topic = new Topic({ dir: scratchDir(), name: "t", partitions: 3 });
  for (const key of ["a", "b", "oxbRxJ", "zzzzzz"]) {
    const partition = topic.partitionFor(key);
    assert.ok(partition >= 0 && partition < 3);
    assert.equal(topic.partitionFor(key), partition);
  }
});

test("each consumer group owns its offsets and receives every record once per poll", () => {
  const dir = scratchDir();
  const topic = new Topic({ dir, name: "t", partitions: 3 });
  for (let n = 0; n < 7; n++) topic.publish(`key${n}`, { n });
  const audit = new ConsumerGroup({ topic, name: "audit", dir });
  const analytics = new ConsumerGroup({ topic, name: "analytics", dir });
  const seenByAudit = [];
  assert.equal(audit.poll((record) => seenByAudit.push(record.value.n)), 7);
  assert.equal(audit.poll(() => assert.fail("nothing new should arrive")), 0);
  assert.equal(analytics.poll(() => {}), 7, "a second group starts from its own offsets");
  assert.deepEqual(seenByAudit.sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6]);
  rmSync(dir, { recursive: true, force: true });
});

test("a handler that throws leaves its record uncommitted, so the next poll redelivers it", () => {
  const dir = scratchDir();
  const topic = new Topic({ dir, name: "t", partitions: 1 });
  topic.publish("k", { n: 1 });
  topic.publish("k", { n: 2 });
  const group = new ConsumerGroup({ topic, name: "audit", dir });
  assert.throws(() => group.poll((record) => {
    if (record.value.n === 2) throw new Error("crash after the first record");
  }), /crash after the first record/);
  assert.deepEqual(group.offsets, [1]);

  const resumed = new ConsumerGroup({ topic, name: "audit", dir });
  const redelivered = [];
  assert.equal(resumed.poll((record) => redelivered.push(record.value.n)), 1);
  assert.deepEqual(redelivered, [2]);
  rmSync(dir, { recursive: true, force: true });
});

test("the topic survives a restart with its records in order", () => {
  const dir = scratchDir();
  new Topic({ dir, name: "t", partitions: 2 }).publish("only", { n: 1 });
  const reopened = new Topic({ dir, name: "t", partitions: 2 });
  const partition = reopened.partitionFor("only");
  assert.equal(reopened.fetch(partition, 0)[0].value.n, 1);
  assert.equal(reopened.publish("again", {}).id, 2);
  rmSync(join(dir), { recursive: true, force: true });
});
