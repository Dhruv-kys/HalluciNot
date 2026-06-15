import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { AdapterError, normalizeRecord, readJsonl } from "../src/adapters.ts";

test("normalizeRecord accepts a bare string", () => {
  assert.deepStrictEqual(normalizeRecord("hi"), { output: "hi", role: "assistant" });
});

test("normalizeRecord reads alternate output keys and role", () => {
  assert.deepStrictEqual(normalizeRecord({ text: "x" }), { output: "x", role: "assistant" });
  assert.deepStrictEqual(normalizeRecord({ content: "y", role: "user" }), {
    output: "y",
    role: "user",
  });
  assert.deepStrictEqual(normalizeRecord({ message: "z" }), { output: "z", role: "assistant" });
});

test("normalizeRecord rejects records with no output text", () => {
  assert.throws(() => normalizeRecord({ foo: "bar" }), AdapterError);
  assert.throws(() => normalizeRecord(42), AdapterError);
  assert.throws(() => normalizeRecord({ output: "" }), AdapterError);
});

function withJsonl(contents: string, fn: (path: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "hallucinot-jsonl-"));
  const path = join(root, "turns.jsonl");
  writeFileSync(path, contents, "utf8");
  try {
    fn(path);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("readJsonl parses records and skips blank lines", () => {
  withJsonl('{"output":"a"}\n\n{"text":"b","role":"user"}\n', (path) => {
    assert.deepStrictEqual(readJsonl(path), [
      { output: "a", role: "assistant" },
      { output: "b", role: "user" },
    ]);
  });
});

test("readJsonl reports the offending line on bad JSON", () => {
  withJsonl('{"output":"a"}\nnot json\n', (path) => {
    assert.throws(() => readJsonl(path), (e: unknown) => e instanceof AdapterError && /:2:/.test((e as Error).message));
  });
});

test("readJsonl throws on empty / missing files", () => {
  withJsonl("\n\n", (path) => assert.throws(() => readJsonl(path), AdapterError));
  assert.throws(() => readJsonl("/no/such/file.jsonl"), AdapterError);
});
