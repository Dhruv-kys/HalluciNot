#!/usr/bin/env node
/**
 * The `hallucinot` command — Phase 2 capture subcommands.
 *
 *   hallucinot init "<task>"   create a session and make it current
 *   hallucinot add ...         append a turn (--output / --stdin / --jsonl)
 *   hallucinot show            print a session (human summary or --json)
 *   hallucinot list            list sessions in the store
 *
 * Scoring/verification columns are placeholders here; later phases fill them in.
 */

import { parseArgs, type ParseArgsConfig } from "node:util";

import { AdapterError, readJsonl, readStdin } from "./adapters.ts";
import { addTurn, createSession, createTask, serializeSession, type Session } from "./models.ts";
import { SessionStore, StoreError } from "./store.ts";
import { VERSION } from "./version.ts";

const USAGE = `hallucinot — verification-first tracking of AI hallucinations and task-drift

usage:
  hallucinot init "<task>" [--name N] [--keywords a,b,c]
  hallucinot add [--session ID] [--role R] (--output TEXT | --stdin | --jsonl FILE)
  hallucinot show [--session ID] [--json]
  hallucinot list

global:
  --store DIR     store root (default: $HALLUCINOT_HOME or ./.hallucinot)
  --version       print version
  --help          print this help`;

type Options = NonNullable<ParseArgsConfig["options"]>;

function parse(args: string[], options: Options) {
  return parseArgs({ args, options, allowPositionals: true, strict: true });
}

function fmtTime(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19);
}

function preview(text: string, width = 72): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= width ? flat : `${flat.slice(0, width - 1)}…`;
}

function storeFrom(values: Record<string, unknown>): SessionStore {
  const store = typeof values.store === "string" ? values.store : undefined;
  return new SessionStore(store).init();
}

// -- commands --------------------------------------------------------------
function cmdInit(args: string[]): number {
  const { values, positionals } = parse(args, {
    store: { type: "string" },
    name: { type: "string" },
    keywords: { type: "string" },
  });
  const task = positionals[0];
  if (!task) throw new StoreError('init requires a task: hallucinot init "<task>"');

  const keywords = String(values.keywords ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  const name = typeof values.name === "string" ? values.name : "";

  const store = storeFrom(values);
  const session = createSession(createTask(task, keywords), { name });
  store.save(session);
  store.setCurrent(session.id);

  console.log(`created session ${session.id}${name ? ` (${name})` : ""} — now current`);
  console.log(`  task: ${preview(session.task.text)}`);
  if (keywords.length) console.log(`  keywords: ${keywords.join(", ")}`);
  return 0;
}

function cmdAdd(args: string[]): number {
  const { values } = parse(args, {
    store: { type: "string" },
    session: { type: "string" },
    role: { type: "string" },
    output: { type: "string" },
    stdin: { type: "boolean" },
    jsonl: { type: "string" },
  });
  const store = storeFrom(values);
  const sessionId = store.resolveSessionId(
    typeof values.session === "string" ? values.session : undefined,
  );
  const session = store.load(sessionId);
  const role = typeof values.role === "string" ? values.role : "assistant";

  let records: { output: string; role: string }[];
  if (typeof values.jsonl === "string") {
    records = readJsonl(values.jsonl);
  } else if (values.stdin) {
    records = [{ output: readStdin(), role }];
  } else if (typeof values.output === "string") {
    records = [{ output: values.output, role }];
  } else {
    throw new StoreError("provide one of --output, --stdin, or --jsonl");
  }

  let added = 0;
  for (const rec of records) {
    if (rec.output === "") continue;
    addTurn(session, rec.output, rec.role || role);
    added++;
  }
  if (added === 0) throw new StoreError("no non-empty turns to add");

  store.save(session);
  console.log(
    `added ${added} ${added === 1 ? "turn" : "turns"} to ${session.id} ` +
      `(now ${session.turns.length} total)`,
  );
  return 0;
}

function cmdShow(args: string[]): number {
  const { values } = parse(args, {
    store: { type: "string" },
    session: { type: "string" },
    json: { type: "boolean" },
  });
  const store = storeFrom(values);
  const sessionId = store.resolveSessionId(
    typeof values.session === "string" ? values.session : undefined,
  );
  const session: Session = store.load(sessionId);

  if (values.json) {
    console.log(serializeSession(session));
    return 0;
  }

  console.log(`session ${session.id}${session.name ? `  [${session.name}]` : ""}`);
  console.log(`  created: ${fmtTime(session.createdAt)}`);
  console.log(`  task:    ${preview(session.task.text)}`);
  if (session.task.keywords.length) {
    console.log(`  keywords: ${session.task.keywords.join(", ")}`);
  }
  console.log(`  turns:   ${session.turns.length}`);
  for (const turn of session.turns) {
    const conf =
      turn.point && turn.point.confidence !== null ? turn.point.confidence.toFixed(2) : "—";
    const idx = String(turn.index).padStart(3);
    console.log(`    [${idx}] ${turn.role.padEnd(10)} conf=${conf}  ${preview(turn.output, 56)}`);
  }
  if (session.memory.length) console.log(`  memory:  ${session.memory.length} entries`);
  return 0;
}

function cmdList(args: string[]): number {
  const { values } = parse(args, { store: { type: "string" } });
  const store = storeFrom(values);
  const sessions = store.listSessions();
  if (sessions.length === 0) {
    console.log('no sessions yet — run `hallucinot init "<task>"`');
    return 0;
  }
  const current = store.getCurrent();
  console.log(`  ${"ID".padEnd(14)}${"TURNS".padStart(6)}  ${"CREATED".padEnd(20)}TASK`);
  for (const s of sessions) {
    const marker = s.id === current ? "* " : "  ";
    const label = preview(s.name || s.task.text, 40);
    console.log(
      `${marker}${s.id.padEnd(14)}${String(s.turns.length).padStart(6)}  ` +
        `${fmtTime(s.createdAt).padEnd(20)}${label}`,
    );
  }
  return 0;
}

// -- entry -----------------------------------------------------------------
export function run(argv: string[]): number {
  const [command, ...rest] = argv;

  if (command === undefined || command === "--help" || command === "-h" || command === "help") {
    console.log(USAGE);
    return command === undefined ? 1 : 0;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    console.log(`hallucinot ${VERSION}`);
    return 0;
  }

  try {
    switch (command) {
      case "init":
        return cmdInit(rest);
      case "add":
        return cmdAdd(rest);
      case "show":
        return cmdShow(rest);
      case "list":
        return cmdList(rest);
      default:
        console.error(`error: unknown command '${command}'\n\n${USAGE}`);
        return 2;
    }
  } catch (e) {
    if (e instanceof StoreError || e instanceof AdapterError) {
      console.error(`error: ${e.message}`);
      return 1;
    }
    if (e instanceof Error) {
      console.error(`error: ${e.message}`);
      return 1;
    }
    throw e;
  }
}

export function main(): void {
  process.exit(run(process.argv.slice(2)));
}

main();
