# Roadmap / Upcoming Enhancements

Status: draft

## Idiomatic Exports

Shipped: `idiomaticExports: 'safe'` is now the default for CJS → ESM, with fallback to the helper bag plus diagnostics when unsafe.

Next:

- Explore a true `'aggressive'` mode (mixed exports/module.exports, limited reassignments, identifier-safe computed keys) with guarded semantics and explicit diagnostics.
- In `'auto'`, allow idiomatic `module.exports = { foo, bar }` when the object literal is simple: single top-level assignment, no spreads/getters/computed/duplicate keys, only identifier keys, RHS values limited to safe literals/identifiers/function|class expressions, no `require()` inside RHS, and no `__proto__`/`prototype` keys. Add a shorthand-object fixture test and keep falling back to the helper for anything more complex.
- Consider a constrained ESM → CJS “pretty” path where live-binding and TLA semantics permit it.

## CLI

- Shipped parity CLI wrapping the core transform (targets, rewriteSpecifier, appendJsExtension/appendDirectoryIndex, detectCircularRequires, topLevelAwait, cjsDefault, diagnostics hooks, out/in-place) with stdin/stdout support, JSON/summary, and list/dry-run paths.
- Next: optional concurrency flag, `--watch` mode with minimal restarts, and a tiny stream type surface to keep test stubs and embedding clean.
- DX polish: keep help/examples in sync with tests; retain single-fixture CLI coverage unless new CLI-specific behaviors emerge (e.g., multi-ext glob ordering, large-input streaming), since transform semantics are already exercised in module fixtures.

## Tooling & Diagnostics

- Emit source maps and clearer diagnostics for transform choices.
- Benchmark scope analysis choices: compare `periscopic`, `scope-analyzer`, and `eslint-scope` on fixtures and pick the final adapter.
