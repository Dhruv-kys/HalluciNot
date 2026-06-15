/**
 * Ingest adapters — get agent turns into HalluciNot.
 *
 * Phase 2 supports two sources:
 *  - stdin / pipe — one output piped in as a single turn.
 *  - JSONL — one JSON object per line, each becoming a turn.
 *
 * Records are normalized loosely so common log shapes "just work": the output
 * text may be under `output`, `text`, `content`, or `message`; the speaker under
 * `role`. Later phases add LLM-call wrappers and streaming hooks here.
 */

import { existsSync, readFileSync } from "node:fs";

/** Raised when input can't be parsed into turns. */
export class AdapterError extends Error {
  override name = "AdapterError";
}

export interface TurnRecord {
  output: string;
  role: string;
}

const OUTPUT_KEYS = ["output", "text", "content", "message"] as const;

/** Coerce a flexible record into `{ output, role }`. */
export function normalizeRecord(record: unknown): TurnRecord {
  if (typeof record === "string") {
    return { output: record, role: "assistant" };
  }
  if (record !== null && typeof record === "object" && !Array.isArray(record)) {
    const obj = record as Record<string, unknown>;
    for (const key of OUTPUT_KEYS) {
      const value = obj[key];
      if (typeof value === "string" && value !== "") {
        const role = typeof obj.role === "string" ? obj.role : "assistant";
        return { output: value, role };
      }
    }
    throw new AdapterError(
      `record has no output text (looked for ${OUTPUT_KEYS.join(", ")}): ${JSON.stringify(record)}`,
    );
  }
  throw new AdapterError(`cannot read a turn from ${typeof record}: ${JSON.stringify(record)}`);
}

/** Read all of stdin as a single output string (trailing newline stripped). */
export function readStdin(): string {
  // fd 0 reads piped/redirected input synchronously.
  try {
    return readFileSync(0, "utf8").replace(/\n+$/, "");
  } catch {
    return "";
  }
}

/** Parse a JSONL file into a list of normalized turn records. */
export function readJsonl(path: string): TurnRecord[] {
  if (!existsSync(path)) {
    throw new AdapterError(`no such JSONL file: ${path}`);
  }
  const records: TurnRecord[] = [];
  const lines = readFileSync(path, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (!line) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new AdapterError(`${path}:${i + 1}: invalid JSON: ${msg}`);
    }
    records.push(normalizeRecord(obj));
  }
  if (records.length === 0) {
    throw new AdapterError(`${path}: no records found`);
  }
  return records;
}
