/**
 * Core domain models for HalluciNot.
 *
 * These are plain data shapes (interfaces) plus explicit factory/parse helpers.
 * The on-disk JSON they produce is part of the public contract: it is stable and
 * language-agnostic so another agent, IDE, or coding tool (or the optional Python
 * ML backends in later phases) can read a session file without this package.
 *
 * Conventions (see CLAUDE.md):
 *  - Scores (`trust`, `alignment`, `confidence`) live in [0, 1] where 1 is best.
 *    They are `null` until something actually scores them.
 *  - Verdict labels are exactly the members of {@link VERDICT_LABELS}.
 *  - Absence of evidence is `unverifiable` — never silently `supported`.
 *  - Timestamps are epoch milliseconds (`Date.now()`).
 *
 * Phase 2 only *captures and persists* these structures; the verification and
 * scoring fields (claims, evidence, verdicts, timeline points) are defined here so
 * the storage format is stable, but they stay empty until later phases fill them.
 */

import { randomUUID } from "node:crypto";

/** The outcome of verifying a single claim against evidence. */
export const VERDICT_LABELS = [
  "supported",
  "unsupported",
  "contradicted",
  "unverifiable",
] as const;
export type VerdictLabel = (typeof VERDICT_LABELS)[number];

/** Bump when an incompatible change is made to the on-disk session format. */
export const SCHEMA_VERSION = 1;

/** The original task the agent must stay aligned to. */
export interface Task {
  /** Source of truth for drift scoring. */
  text: string;
  /** Optional terms to weight; if empty, scorers derive their own. */
  keywords: string[];
}

/** A piece of grounding used to judge a claim. */
export interface Evidence {
  id: string;
  /** Where it came from, e.g. "context", "tool:node", "retrieval". */
  source: string;
  /** Pointer inside the source (line range, URL, span). */
  locator: string;
  /** The actual evidence text. */
  snippet: string;
}

/** The result of verifying one claim, with the evidence that produced it. */
export interface Verdict {
  label: VerdictLabel;
  confidence: number;
  verifier: string;
  /** Ids of the {@link Evidence} this verdict relied on. */
  evidenceRef: string[];
  rationale: string;
}

/** An atomic, checkable statement extracted from an output. */
export interface Claim {
  id: string;
  text: string;
  /** Char offsets [start, end) in the output, or null if unknown. */
  span: [number, number] | null;
  verdict: Verdict | null;
}

/**
 * One scored point on a session's confidence timeline.
 * `trust` is groundedness (Pillar A), `alignment` is task-drift (Pillar B), and
 * `confidence` is the fused signal the graph plots. All null until scored.
 */
export interface TimelinePoint {
  turnIndex: number;
  trust: number | null;
  alignment: number | null;
  confidence: number | null;
  components: Record<string, number>;
  timestamp: number;
}

/** One agent/LLM output in a session, plus anything derived from it. */
export interface Turn {
  index: number;
  output: string;
  role: string;
  timestamp: number;
  claims: Claim[];
  evidence: Evidence[];
  point: TimelinePoint | null;
}

/** A fact distilled from a session for later handoff. */
export interface MemoryEntry {
  key: string;
  value: string;
  provenance: string;
  verified: boolean;
  turnIndex: number | null;
  timestamp: number;
}

/** A tracked agent run: a task plus the ordered turns produced against it. */
export interface Session {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: number;
  task: Task;
  turns: Turn[];
  memory: MemoryEntry[];
}

// -- factories -------------------------------------------------------------

export function now(): number {
  return Date.now();
}

export function newId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

export function createTask(text: string, keywords: string[] = []): Task {
  return { text, keywords: [...keywords] };
}

export function createSession(
  task: Task,
  opts: { id?: string; name?: string; createdAt?: number } = {},
): Session {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id ?? newId(),
    name: opts.name ?? "",
    createdAt: opts.createdAt ?? now(),
    task,
    turns: [],
    memory: [],
  };
}

/** Append a new turn to a session and return it (index assigned automatically). */
export function addTurn(session: Session, output: string, role = "assistant"): Turn {
  const turn: Turn = {
    index: session.turns.length,
    output,
    role,
    timestamp: now(),
    claims: [],
    evidence: [],
    point: null,
  };
  session.turns.push(turn);
  return turn;
}

/** Scored confidence values for turns that have been scored (skips unscored). */
export function confidences(session: Session): number[] {
  const out: number[] = [];
  for (const t of session.turns) {
    if (t.point && t.point.confidence !== null) out.push(t.point.confidence);
  }
  return out;
}

// -- tolerant parsing ------------------------------------------------------
// Reading must never throw on a slightly-off file: fill defaults, coerce types.

function asString(v: unknown, d = ""): string {
  return typeof v === "string" ? v : d;
}
function asNumber(v: unknown, d: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}
function asNumberOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function asBool(v: unknown, d = false): boolean {
  return typeof v === "boolean" ? v : d;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function parseVerdictLabel(v: unknown): VerdictLabel {
  return (VERDICT_LABELS as readonly string[]).includes(v as string)
    ? (v as VerdictLabel)
    : "unverifiable";
}

function parseComponents(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(asRecord(v))) {
    if (typeof val === "number" && Number.isFinite(val)) out[k] = val;
  }
  return out;
}

function parseSpan(v: unknown): [number, number] | null {
  if (Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number") {
    return [v[0], v[1]];
  }
  return null;
}

export function parseTask(v: unknown): Task {
  const d = asRecord(v);
  return {
    text: asString(d.text),
    keywords: asArray(d.keywords).map((k) => asString(k)),
  };
}

export function parseEvidence(v: unknown): Evidence {
  const d = asRecord(v);
  return {
    id: asString(d.id) || newId(),
    source: asString(d.source),
    locator: asString(d.locator),
    snippet: asString(d.snippet),
  };
}

export function parseVerdict(v: unknown): Verdict {
  const d = asRecord(v);
  return {
    label: parseVerdictLabel(d.label),
    confidence: asNumber(d.confidence, 0),
    verifier: asString(d.verifier),
    evidenceRef: asArray(d.evidenceRef).map((r) => asString(r)),
    rationale: asString(d.rationale),
  };
}

export function parseClaim(v: unknown): Claim {
  const d = asRecord(v);
  return {
    id: asString(d.id) || newId(),
    text: asString(d.text),
    span: parseSpan(d.span),
    verdict: d.verdict == null ? null : parseVerdict(d.verdict),
  };
}

export function parseTimelinePoint(v: unknown): TimelinePoint {
  const d = asRecord(v);
  return {
    turnIndex: asNumber(d.turnIndex, 0),
    trust: asNumberOrNull(d.trust),
    alignment: asNumberOrNull(d.alignment),
    confidence: asNumberOrNull(d.confidence),
    components: parseComponents(d.components),
    timestamp: asNumber(d.timestamp, now()),
  };
}

export function parseTurn(v: unknown): Turn {
  const d = asRecord(v);
  return {
    index: asNumber(d.index, 0),
    output: asString(d.output),
    role: asString(d.role, "assistant"),
    timestamp: asNumber(d.timestamp, now()),
    claims: asArray(d.claims).map(parseClaim),
    evidence: asArray(d.evidence).map(parseEvidence),
    point: d.point == null ? null : parseTimelinePoint(d.point),
  };
}

export function parseMemoryEntry(v: unknown): MemoryEntry {
  const d = asRecord(v);
  return {
    key: asString(d.key),
    value: asString(d.value),
    provenance: asString(d.provenance),
    verified: asBool(d.verified),
    turnIndex: asNumberOrNull(d.turnIndex),
    timestamp: asNumber(d.timestamp, now()),
  };
}

export function parseSession(v: unknown): Session {
  const d = asRecord(v);
  return {
    schemaVersion: asNumber(d.schemaVersion, SCHEMA_VERSION),
    id: asString(d.id) || newId(),
    name: asString(d.name),
    createdAt: asNumber(d.createdAt, now()),
    task: parseTask(d.task),
    turns: asArray(d.turns).map(parseTurn),
    memory: asArray(d.memory).map(parseMemoryEntry),
  };
}

/** Serialize a session to the canonical on-disk JSON string. */
export function serializeSession(session: Session): string {
  return JSON.stringify(session, null, 2);
}
