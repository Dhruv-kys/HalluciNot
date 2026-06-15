import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addTurn,
  confidences,
  createSession,
  createTask,
  parseSession,
  SCHEMA_VERSION,
  serializeSession,
  type Session,
} from "../src/models.ts";

/** A session exercising every field, with fixed values for deterministic equality. */
function fullSession(): Session {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "abc123def456",
    name: "demo",
    createdAt: 1_700_000_000_000,
    task: { text: "Summarize report.pdf", keywords: ["revenue", "ceo"] },
    turns: [
      {
        index: 0,
        output: "Revenue was $4.2M and the CEO is Jane Doe.",
        role: "assistant",
        timestamp: 1_700_000_001_000,
        claims: [
          {
            id: "claim0001",
            text: "Revenue was $4.2M",
            span: [0, 17],
            verdict: {
              label: "supported",
              confidence: 0.9,
              verifier: "lexical",
              evidenceRef: ["ev0001"],
              rationale: "matches source line 12",
            },
          },
          {
            id: "claim0002",
            text: "the CEO is Jane Doe",
            span: [22, 41],
            verdict: {
              label: "unverifiable",
              confidence: 0.0,
              verifier: "lexical",
              evidenceRef: [],
              rationale: "",
            },
          },
        ],
        evidence: [
          { id: "ev0001", source: "context", locator: "L12", snippet: "Revenue: $4.2M" },
        ],
        point: {
          turnIndex: 0,
          trust: 0.5,
          alignment: 0.8,
          confidence: 0.65,
          components: { taskRecall: 0.8, supportRate: 0.5 },
          timestamp: 1_700_000_002_000,
        },
      },
    ],
    memory: [
      {
        key: "revenue",
        value: "$4.2M",
        provenance: "session:abc123def456/turn:0/ev:ev0001",
        verified: true,
        turnIndex: 0,
        timestamp: 1_700_000_003_000,
      },
    ],
  };
}

test("createSession sets defaults", () => {
  const s = createSession(createTask("do the thing"));
  assert.equal(s.schemaVersion, SCHEMA_VERSION);
  assert.equal(s.turns.length, 0);
  assert.equal(s.memory.length, 0);
  assert.equal(s.task.text, "do the thing");
  assert.match(s.id, /^[0-9a-f]{12}$/);
});

test("addTurn assigns sequential indexes", () => {
  const s = createSession(createTask("t"));
  const a = addTurn(s, "first");
  const b = addTurn(s, "second", "user");
  assert.equal(a.index, 0);
  assert.equal(b.index, 1);
  assert.equal(b.role, "user");
  assert.equal(s.turns.length, 2);
});

test("round-trips a fully populated session unchanged", () => {
  const s = fullSession();
  const back = parseSession(JSON.parse(serializeSession(s)));
  assert.deepStrictEqual(back, s);
});

test("round-trips an empty session unchanged", () => {
  const s = createSession(createTask("task", ["k1"]), { id: "fixedid00001", createdAt: 1 });
  const back = parseSession(JSON.parse(serializeSession(s)));
  assert.deepStrictEqual(back, s);
});

test("parse is tolerant: defaults fill in, never throws", () => {
  const s = parseSession({ task: { text: "x" } });
  assert.equal(s.task.text, "x");
  assert.equal(s.turns.length, 0);
  assert.equal(s.schemaVersion, SCHEMA_VERSION);
  // Completely empty input still yields a valid Session.
  const empty = parseSession({});
  assert.equal(empty.task.text, "");
});

test("unknown verdict labels become 'unverifiable'", () => {
  const s = parseSession({
    task: { text: "t" },
    turns: [
      {
        index: 0,
        output: "o",
        claims: [{ text: "c", verdict: { label: "totally-made-up" } }],
      },
    ],
  });
  assert.equal(s.turns[0]!.claims[0]!.verdict!.label, "unverifiable");
});

test("confidences() collects only scored turns", () => {
  const s = createSession(createTask("t"));
  addTurn(s, "a");
  addTurn(s, "b");
  s.turns[0]!.point = {
    turnIndex: 0,
    trust: null,
    alignment: null,
    confidence: 0.7,
    components: {},
    timestamp: 0,
  };
  assert.deepStrictEqual(confidences(s), [0.7]);
});
