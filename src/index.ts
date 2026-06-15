/**
 * HalluciNot — verification-first detection of hallucinations and task-drift.
 *
 * Library entry point: re-exports the Phase 2 core (models, store, adapters) for
 * programmatic use. The CLI lives in `cli.ts`.
 */

export * from "./models.ts";
export * from "./store.ts";
export * from "./adapters.ts";
export { VERSION } from "./version.ts";
