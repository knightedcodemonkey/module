# Roadmap / Upcoming Enhancements

Status: draft

## Idiomatic Exports

Shipped: `idiomaticExports: 'safe'` is now the default for CJS → ESM, with fallback to the helper bag plus diagnostics when unsafe. Auto lifts simple `module.exports = { foo, bar }` object literals to idiomatic exports when safe.

Next:

- Explore a true `'aggressive'` mode (mixed exports/module.exports, limited reassignments, identifier-safe computed keys) with guarded semantics and explicit diagnostics.
- Consider a constrained ESM → CJS “pretty” path where live-binding and TLA semantics permit it.

## CLI

- Shipped parity CLI wrapping the core transform (targets, rewriteSpecifier, appendJsExtension/appendDirectoryIndex, detectCircularRequires, topLevelAwait, cjsDefault, diagnostics hooks, out/in-place) with stdin/stdout support, JSON/summary, and list/dry-run paths.
- Next: optional concurrency flag, `--watch` mode with minimal restarts, and a tiny stream type surface to keep test stubs and embedding clean.
- DX polish: keep help/examples in sync with tests; retain single-fixture CLI coverage unless new CLI-specific behaviors emerge (e.g., multi-ext glob ordering, large-input streaming), since transform semantics are already exercised in module fixtures.

## Tooling & Diagnostics

- Emit source maps and clearer diagnostics for transform choices.
- Benchmark scope analysis choices: compare `periscopic`, `scope-analyzer`, and `eslint-scope` on fixtures and pick the final adapter.

## Refactors

- Split `src/format.ts` into focused modules: exports planning (idiomatic/helper), import/require lowering, diagnostics/warnings, and code-emission utilities; add lightweight integration harness and incremental tests to keep coverage tight during the split.
- Add lint rule/enforcer for import ordering: builtins first, then npm/library deps, then relative paths.
