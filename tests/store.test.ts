import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { addTurn, createSession, createTask } from "../src/models.ts";
import { SessionStore, StoreError } from "../src/store.ts";

function tmpStore(): { store: SessionStore; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "hallucinot-"));
  return { store: new SessionStore(root).init(), cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("save then load round-trips a session", () => {
  const { store, cleanup } = tmpStore();
  try {
    const s = createSession(createTask("verify outputs", ["claim"]), { name: "s1" });
    addTurn(s, "hello world");
    store.save(s);
    assert.deepStrictEqual(store.load(s.id), s);
  } finally {
    cleanup();
  }
});

test("load of a missing session throws StoreError", () => {
  const { store, cleanup } = tmpStore();
  try {
    assert.throws(() => store.load("nope"), StoreError);
  } finally {
    cleanup();
  }
});

test("list returns sessions newest first", () => {
  const { store, cleanup } = tmpStore();
  try {
    const older = createSession(createTask("a"), { id: "aaa", createdAt: 1000 });
    const newer = createSession(createTask("b"), { id: "bbb", createdAt: 2000 });
    store.save(older);
    store.save(newer);
    assert.deepStrictEqual(store.listIds(), ["aaa", "bbb"]);
    assert.deepStrictEqual(
      store.listSessions().map((s) => s.id),
      ["bbb", "aaa"],
    );
  } finally {
    cleanup();
  }
});

test("current pointer set/get/resolve", () => {
  const { store, cleanup } = tmpStore();
  try {
    const s = createSession(createTask("t"), { id: "cur123" });
    store.save(s);
    assert.equal(store.getCurrent(), null);
    store.setCurrent(s.id);
    assert.equal(store.getCurrent(), "cur123");
    assert.equal(store.resolveSessionId(), "cur123");
    assert.equal(store.resolveSessionId("cur123"), "cur123");
    assert.throws(() => store.resolveSessionId("ghost"), StoreError);
  } finally {
    cleanup();
  }
});

test("resolveSessionId with no current and no arg throws", () => {
  const { store, cleanup } = tmpStore();
  try {
    assert.throws(() => store.resolveSessionId(), StoreError);
  } finally {
    cleanup();
  }
});

test("delete removes the file and clears current", () => {
  const { store, cleanup } = tmpStore();
  try {
    const s = createSession(createTask("t"), { id: "del123" });
    store.save(s);
    store.setCurrent(s.id);
    store.delete(s.id);
    assert.equal(store.exists("del123"), false);
    assert.equal(store.getCurrent(), null);
    assert.throws(() => store.delete("del123"), StoreError);
  } finally {
    cleanup();
  }
});
