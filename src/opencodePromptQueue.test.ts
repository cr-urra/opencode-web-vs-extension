import * as assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { getOpenCodePromptQueueScript } from "./opencodePromptQueue";

function harness() {
  let now = 0;
  let target: object | null = null;
  let id = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const reports: string[] = [];
  const sandbox = {
    Date: { now: () => now },
    document: { querySelector: () => target },
    report: (message: string) => reports.push(message),
    setTimeout: (callback: () => void, delay: number) => {
      timers.set(++id, { at: now + delay, callback });
      return id;
    },
  };
  runInNewContext(getOpenCodePromptQueueScript(), sandbox);
  const queue = (sandbox as typeof sandbox & { queueOpenCodePromptAction: (callback: (element: object) => void) => void }).queueOpenCodePromptAction;
  return {
    queue, reports, timers,
    setTarget: (value: object | null) => { target = value; },
    advance: (duration: number) => {
      const end = now + duration;
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) {break;}
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
      }
      now = end;
    },
  };
}

const prompt = { isConnected: true, isContentEditable: true, tagName: "DIV" };

test("waits for a mounted prompt and delivers queued commands in order", () => {
  const h = harness();
  const delivered: number[] = [];
  h.queue(element => { assert.equal(element, prompt); delivered.push(1); });
  h.queue(() => delivered.push(2));
  h.advance(1000);
  assert.deepEqual(delivered, []);
  h.setTarget(prompt);
  h.advance(50);
  assert.deepEqual(delivered, [1, 2]);
  assert.equal(h.timers.size, 0);
});

test("defers even when the prompt already exists, allowing mount listeners to finish", () => {
  const h = harness();
  h.setTarget(prompt);
  let delivered = false;
  h.queue(() => { delivered = true; });
  assert.equal(delivered, false);
  h.advance(0);
  assert.equal(delivered, true);
});

test("expires commands instead of delivering them to a later unrelated editor", () => {
  const h = harness();
  let delivered = false;
  h.queue(() => { delivered = true; });
  h.advance(10000);
  h.setTarget(prompt);
  h.advance(50);
  assert.equal(delivered, false);
  assert.equal(h.reports.length, 1);
  assert.equal(h.timers.size, 0);
});

test("ignores detached and noneditable elements until a connected editor appears", () => {
  const h = harness();
  let delivered = false;
  h.setTarget({ ...prompt, isConnected: false });
  h.queue(() => { delivered = true; });
  h.advance(50);
  h.setTarget({ tagName: "BODY", isConnected: true });
  h.advance(50);
  assert.equal(delivered, false);
  h.setTarget({ tagName: "TEXTAREA", isConnected: true });
  h.advance(50);
  assert.equal(delivered, true);
});

test("a failed command does not block the next queued action", () => {
  const h = harness();
  h.setTarget(prompt);
  let delivered = false;
  h.queue(() => { throw new Error("fixture"); });
  h.queue(() => { delivered = true; });
  h.advance(0);
  assert.equal(delivered, true);
  assert.match(h.reports[0], /fixture/);
});
