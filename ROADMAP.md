# HalluciNot — Roadmap

A verification-first framework for detecting, preventing, and measuring
hallucinations and task-drift in AI agent workflows. Built **small first, on a
strong base** — each phase ships something usable and is a foundation for the next.

## Vision

Make it normal to treat an AI agent's output as **unverified until proven**, in
the terminal, with zero setup. Every claim is checked against evidence; every
verdict is explainable; the confidence timeline is visible live; and verified
knowledge survives context limits by handing off to the next agent.

## How to read this

- Phases are sequential; each has **Goal · Deliverables · Exit criteria**.
- "Exit criteria" are the bar for calling a phase done — usually a demo + tests.
- Components in **bold** map to [ARCHITECTURE.md](ARCHITECTURE.md) §4.
- Per-phase design decisions live in [DESIGN_NOTES.md](DESIGN_NOTES.md) (Part D).
- Status legend: ✅ done · 🟡 in progress · ⬜ not started.

## Phase overview

| Phase | Theme                              | Headline outcome                                  | Status |
| ----- | ---------------------------------- | ------------------------------------------------- | ------ |
| 1     | Foundations & Design               | Agreed architecture + roadmap + working rules     | ✅     |
| 2     | Core skeleton & capture            | Record and reload a session in the terminal       | ✅     |
| 3     | Claim extraction + verification    | Per-claim verdicts + an output trust score        | ⬜     |
| 4     | Drift tracking + graph + alerts    | Live graph that drops & alerts on drift           | ⬜     |
| 5     | Evidence depth                     | Verify via tools, retrieval, and citations        | ⬜     |
| 6     | Memory handoff                     | Verified memory survives context exhaustion       | ⬜     |
| 7     | Advanced verifiers & calibration   | NLI/embedding/LLM-judge backends + benchmarks     | ⬜     |
| 8     | Live integration & TUI             | Wrap a real agent loop end-to-end; packaged       | ⬜     |

---

## Phase 1 — Foundations & Design  ✅

**Goal:** Lock the concept, architecture, and working conventions before code.

**Deliverables**
- ✅ Repository analysis (state, toolchain, license).
- ✅ [ARCHITECTURE.md](ARCHITECTURE.md) — verification-first design, components, data model.
- ✅ [ROADMAP.md](ROADMAP.md) — this document.
- ✅ [CLAUDE.md](CLAUDE.md) — conventions & guardrails for working in the repo.

**Exit criteria:** ✅ Docs written; stack decided (Node-first, Python optional).

## Phase 2 — Core skeleton & capture  ✅

**Goal:** A clean, persistent spine — capture turns, store them, reload them. No
verification logic yet; just the data backbone everything else hangs off.

**Deliverables**
- ✅ Data model (`src/models.ts`): `Session`, `Turn`, `Task`, `Claim`, `Evidence`,
  `Verdict`, `TimelinePoint`, `MemoryEntry` — TypeScript types with tolerant JSON
  (de)serialization.
- ✅ **SessionStore** (`src/store.ts`, JSON files, atomic writes, current pointer).
- ✅ **Adapters** (`src/adapters.ts`): ingest from stdin/pipe and JSONL logs.
- ✅ **CLI** (`src/cli.ts`): `init`, `add`, `show`, `list` (`parseArgs`, `hallucinot` bin).
- ✅ Packaging (`package.json`, zero runtime deps) + `node:test` harness (24 tests).

**Exit criteria:** ✅ Create a session, add turns from stdin/JSONL, reload it
identically; serialization round-trip + CLI e2e tests pass (`npm test`).

## Phase 3 — Claim extraction + verification (Pillar A baseline)  ⬜

**Goal:** Turn an output into atomic claims and verify each against provided
context — fully offline.

**Deliverables**
- **ClaimExtractor** (heuristic: sentence segmentation + claim filtering).
- **EvidenceProvider**: provided-context store.
- **Verifier** (lexical/overlap) → verdicts `{supported, unsupported, contradicted, unverifiable}`.
- **ScoringEngine**: aggregate verdicts → output **trust score**.
- CLI: `verify` (output + context → verdict table + trust).

**Exit criteria:** A fixture output with supporting/contradicting context yields
correct per-claim verdicts and a trust score; deterministic tests cover each label.

## Phase 4 — Drift tracking + terminal graph + alerts (Pillar B + UI)  ⬜

**Goal:** The signature experience — *"when it drifts, the graph comes down and alerts."*

**Deliverables**
- **DriftScorer**: alignment of each output to the task over turns.
- **ScoringEngine** fuses trust + alignment → `TimelinePoint.confidence`.
- **TerminalRenderer**: Unicode sparkline + multi-line line chart + verdict table.
- **AlertEngine**: threshold breach, slope/plunge detection, hysteresis.
- CLI: `track` / `watch` (live timeline) and `show` (historical graph).

**Exit criteria:** On a drifting/hallucinating fixture session, the rendered graph
visibly falls and an alert fires at the right turn; alert logic is unit-tested.

## Phase 5 — Evidence depth  ⬜

**Goal:** Verify against the real world, not just pasted context.

**Deliverables**
- **EvidenceProvider** backends: local retrieval over a corpus; citation checker
  (resolve & match referenced sources); tool/code-exec verifier (sandboxed) for
  computable claims (math, code output, lookups).
- CLI flags to enable/compose providers.

**Exit criteria:** A claim is verified via at least one tool and one retrieval
source, each with provenance recorded in the session.

## Phase 6 — Memory handoff  ⬜

**Goal:** The second signature feature — *verified knowledge outlives the context window.*

**Deliverables**
- **MemoryStore**: persist verified facts (with provenance) distilled from sessions.
- Export/import **handoff bundles**: portable JSON + human-readable Markdown.
- A format consumable by other agents/IDEs/coding tools (incl. an MCP-friendly shape).
- CLI: `memory add|list|export|import`; auto-distill verified claims into memory.

**Exit criteria:** Export memory from a "context-exhausted" session and import it
into a fresh one; demo shows the new context picking up verified facts.

## Phase 7 — Advanced verifiers & calibration  ⬜

**Goal:** Higher accuracy via opt-in heavy backends, measured honestly.

**Deliverables**
- **Verifier** backends: NLI, embedding-similarity, and LLM-judge (provider-agnostic).
- Benchmark harness + labeled fixture set; score **calibration**.
- Pluggable scorer weights tuned against the benchmark.

**Exit criteria:** An advanced verifier measurably beats the lexical baseline on
the labeled set, with results reproducible from the harness.

## Phase 8 — Live integration & TUI  ⬜

**Goal:** Drop HalluciNot into a real agent loop.

**Deliverables**
- LLM-call **wrappers** + streaming verification hooks.
- Richer TUI (live panels) and a documented **plugin API** for third-party stages.
- Packaging & release (`npm publish`), docs, examples.

**Exit criteria:** Wrap a real agent/LLM loop end-to-end with live verification;
`npm install -g hallucinot` then `hallucinot` works on a clean machine.

---

## Guardrails carried through every phase

- The baseline stays **offline and runs on npm alone**; the core has **zero runtime
  dependencies**; heavy (Python) ML backends are always opt-in.
- **No unexplained scores** — every verdict keeps its evidence.
- The **JSON artifact contract** stays stable and language-agnostic.
- Each phase ships **tests + a runnable demo**, not just code.

## Current status

**Phases 1–2 complete.** Stack decided (Node + TypeScript, Python optional). The
core skeleton is in `src/` with a JSON `SessionStore`, stdin/JSONL adapters, and
the `init/add/show/list` CLI, all covered by 24 passing `node:test` tests. Next up:
**Phase 3 — claim extraction + lexical verification** (the first scoring).
