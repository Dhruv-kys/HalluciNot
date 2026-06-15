/**
 * Session persistence for HalluciNot.
 *
 * Sessions are stored as one JSON file per session under
 * `<root>/sessions/<id>.json`. A small `CURRENT` file at the root records the
 * active session so the CLI can default to it. Writes are atomic (temp file +
 * rename) so a crash mid-write can't corrupt an existing session.
 *
 * The store root resolves (in order): an explicit value, `$HALLUCINOT_HOME`,
 * then `./.hallucinot`.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Session } from "./models.ts";
import { parseSession, serializeSession } from "./models.ts";

/** Raised for store-level problems (missing session, bad path, ...). */
export class StoreError extends Error {
  override name = "StoreError";
}

function expandHome(p: string): string {
  return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

export function defaultStoreRoot(explicit?: string): string {
  if (explicit) return expandHome(explicit);
  const env = process.env.HALLUCINOT_HOME;
  if (env) return expandHome(env);
  return ".hallucinot";
}

export class SessionStore {
  readonly root: string;
  readonly sessionsDir: string;
  readonly currentFile: string;

  constructor(root?: string) {
    this.root = defaultStoreRoot(root);
    this.sessionsDir = join(this.root, "sessions");
    this.currentFile = join(this.root, "CURRENT");
  }

  /** Create the store directories if they don't exist. Idempotent. */
  init(): this {
    mkdirSync(this.sessionsDir, { recursive: true });
    return this;
  }

  pathFor(id: string): string {
    return join(this.sessionsDir, `${id}.json`);
  }

  exists(id: string): boolean {
    return existsSync(this.pathFor(id));
  }

  /** Persist a session atomically and return its file path. */
  save(session: Session): string {
    this.init();
    const path = this.pathFor(session.id);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, serializeSession(session), "utf8");
    renameSync(tmp, path);
    return path;
  }

  load(id: string): Session {
    const path = this.pathFor(id);
    if (!existsSync(path)) {
      throw new StoreError(`no session '${id}' in ${this.sessionsDir}`);
    }
    return parseSession(JSON.parse(readFileSync(path, "utf8")));
  }

  delete(id: string): void {
    const path = this.pathFor(id);
    if (!existsSync(path)) {
      throw new StoreError(`no session '${id}' to delete`);
    }
    rmSync(path);
    if (this.getCurrent() === id) {
      rmSync(this.currentFile, { force: true });
    }
  }

  listIds(): string[] {
    if (!existsSync(this.sessionsDir)) return [];
    return readdirSync(this.sessionsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -".json".length))
      .sort();
  }

  /** Load every session, newest first. */
  listSessions(): Session[] {
    const sessions = this.listIds().map((id) => this.load(id));
    sessions.sort((a, b) => b.createdAt - a.createdAt);
    return sessions;
  }

  // -- current pointer -----------------------------------------------------
  setCurrent(id: string): void {
    this.init();
    writeFileSync(this.currentFile, id, "utf8");
  }

  getCurrent(): string | null {
    if (!existsSync(this.currentFile)) return null;
    const value = readFileSync(this.currentFile, "utf8").trim();
    return value || null;
  }

  /** Pick the session to act on: an explicit id, else the current pointer. */
  resolveSessionId(explicit?: string): string {
    if (explicit) {
      if (!this.exists(explicit)) {
        throw new StoreError(`no session '${explicit}' in ${this.sessionsDir}`);
      }
      return explicit;
    }
    const current = this.getCurrent();
    if (current && this.exists(current)) return current;
    throw new StoreError(
      "no session specified and no current session set; " +
        "run `hallucinot init \"<task>\"` or pass --session <id>",
    );
  }
}
