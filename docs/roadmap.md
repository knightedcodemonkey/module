# Roadmap / Upcoming Enhancements

Status: draft

## Idiomatic Exports

- Explore a true `'aggressive'` mode (mixed exports/module.exports, limited reassignments, identifier-safe computed keys) with guarded semantics and explicit diagnostics.
- Consider a constrained ESM → CJS “pretty” path where live-binding and TLA semantics permit it.

## CLI

- Optional concurrency flag, `--watch` mode with minimal restarts, and a tiny stream type surface to keep test stubs and embedding clean.
- DX polish: keep help/examples in sync with tests; retain single-fixture CLI coverage unless new CLI-specific behaviors emerge (e.g., multi-ext glob ordering, large-input streaming), since transform semantics are already exercised in module fixtures.

## Tooling & Diagnostics

- Benchmark scope analysis choices: compare `periscopic`, `scope-analyzer`, and `eslint-scope` on fixtures and pick the final adapter.

## Potential Breaking Changes (flag/document clearly)

- Template literal specifier rewriting: changing the default to skip interpolated template literals would be breaking.
- Cycle detection hardening: expanding scope (e.g., configurable roots, glob exclusions, or additional extensions) could alter diagnostics and should be flagged.
