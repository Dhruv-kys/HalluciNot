<div align="center">

# HalluciNot

<img src="assets/hallucinot.png" alt="HalluciNot" width="360" />

---

*Detect, prevent, and measure hallucinations and task-drift in AI agent workflows — in your terminal.*

---

![Built with TypeScript](https://img.shields.io/badge/built%20with-TypeScript-3178C6?logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/Node-22.6%2B-339933?logo=node.js&logoColor=white)
![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-Apache--2.0-green)
![Status](https://img.shields.io/badge/status-WIP-orange)

</div>

> 🚧 **Work in progress — under active development.** The core is in place; new
> capabilities are being built phase by phase (see [ROADMAP.md](ROADMAP.md)).

HalluciNot is a **verification-first** framework: an AI agent's output is treated
as **unverified until proven**. It extracts the claims an output makes, checks
each against evidence, tracks how aligned the agent stays to its task over time,
and (in later phases) draws a live confidence graph that drops and alerts when the
agent starts hallucinating or drifting — then distills verified facts into
portable memory that survives the context window.

Two pillars feed one confidence timeline:

- **Groundedness** — *is what it said true?* (claims vs. evidence)
- **Task drift** — *is it still doing the right thing?* (alignment vs. the task)

## Status

🚧 **Actively building.** Phase 2 (the core skeleton) is complete — you can capture
an agent session (a task plus its turns) from the CLI, persist it as
language-agnostic JSON, and reload it. **In progress next:** claim extraction +
verification, then the drift graph, alerts, and memory handoff — see
[ROADMAP.md](ROADMAP.md).

## Requirements

- **Node.js ≥ 22.6** (local dev used v25). Node runs the TypeScript source
  directly — no build step. **Zero runtime dependencies.**

## Quickstart

```bash
npm install            # dev tooling only (typescript, @types/node)

# create a session for the task the agent must stay aligned to
node src/cli.ts init "Refactor the auth module without changing behavior" \
  --name auth-refactor --keywords auth,refactor

# capture agent outputs as "turns" — from a flag, a pipe, or a JSONL log
node src/cli.ts add --output "Extracted token validation into verifyToken()."
echo "Reading auth.ts and mapping the public API." | node src/cli.ts add --stdin
node src/cli.ts add --jsonl turns.jsonl     # one JSON object per line

# inspect
node src/cli.ts list
node src/cli.ts show          # human summary (conf= is a placeholder until Phase 3/4)
node src/cli.ts show --json   # raw session JSON
```

Sessions are stored under `./.hallucinot/` by default (override with `--store DIR`
or `$HALLUCINOT_HOME`). JSONL records are read loosely: the output text may live
under `output`, `text`, `content`, or `message`, with an optional `role`.

## Development

```bash
npm test            # run the suite (node:test) — 24 tests
npm run typecheck   # tsc --noEmit
```

## Project structure

```
src/            Node + TypeScript core (models, store, adapters, cli)
tests/          node:test suites (offline, deterministic)
python/         optional ML backends (later phases): embeddings / NLI / LLM-judge
ROADMAP.md      phased plan (small first, strong base)
```

## License

Apache-2.0 — see [LICENSE](LICENSE).
