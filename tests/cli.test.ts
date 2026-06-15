import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], home: string, input?: string): CliResult {
  const res = spawnSync("node", [CLI, ...args], {
    input: input ?? "",
    encoding: "utf8",
    env: { ...process.env, HALLUCINOT_HOME: home },
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function withHome(fn: (home: string) => void): void {
  const home = mkdtempSync(join(tmpdir(), "hallucinot-cli-"));
  try {
    fn(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

test("--version prints the version", () => {
  withHome((home) => {
    const r = runCli(["--version"], home);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^hallucinot \d+\.\d+\.\d+/);
  });
});

test("full capture flow: init -> add (output/jsonl/stdin) -> show/list reload identically", () => {
  withHome((home) => {
    // init
    const init = runCli(["init", "Summarize report.pdf", "--name", "demo", "--keywords", "a,b"], home);
    assert.equal(init.status, 0, init.stderr);
    const id = init.stdout.match(/created session (\w+)/)?.[1];
    assert.ok(id, "session id should be printed");

    // add one turn via --output
    const add1 = runCli(["add", "--output", "first output"], home);
    assert.equal(add1.status, 0, add1.stderr);
    assert.match(add1.stdout, /added 1 turn /);

    // add two turns via --jsonl
    const jsonl = join(home, "turns.jsonl");
    writeFileSync(jsonl, '{"output":"second"}\n{"text":"third","role":"user"}\n', "utf8");
    const add2 = runCli(["add", "--jsonl", jsonl], home);
    assert.equal(add2.status, 0, add2.stderr);
    assert.match(add2.stdout, /added 2 turns /);

    // add one turn via --stdin
    const add3 = runCli(["add", "--stdin"], home, "fourth via stdin\n");
    assert.equal(add3.status, 0, add3.stderr);

    // list shows it as current
    const list = runCli(["list"], home);
    assert.equal(list.status, 0);
    assert.match(list.stdout, new RegExp(`\\* ${id}`));

    // show --json reloads with all four turns intact
    const show = runCli(["show", "--json"], home);
    assert.equal(show.status, 0);
    const session = JSON.parse(show.stdout);
    assert.equal(session.id, id);
    assert.equal(session.task.text, "Summarize report.pdf");
    assert.deepStrictEqual(session.task.keywords, ["a", "b"]);
    assert.equal(session.turns.length, 4);
    assert.deepStrictEqual(
      session.turns.map((t: { output: string }) => t.output),
      ["first output", "second", "third", "fourth via stdin"],
    );
    assert.equal(session.turns[2].role, "user");
  });
});

test("add with no source is an error", () => {
  withHome((home) => {
    runCli(["init", "t"], home);
    const r = runCli(["add"], home);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /provide one of --output, --stdin, or --jsonl/);
  });
});

test("add with no current session is an error", () => {
  withHome((home) => {
    const r = runCli(["add", "--output", "x"], home);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no current session/);
  });
});

test("unknown command exits 2", () => {
  withHome((home) => {
    const r = runCli(["frobnicate"], home);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /unknown command/);
  });
});
