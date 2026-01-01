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

## Potential Breaking Changes (flag/document clearly)

- Template literal specifier rewriting: skip or gate rewriting when `TemplateLiteral` has expressions to avoid touching non-static specifiers; needs opt-in or documented behavior change.
- Cycle detection hardening: expand extensions (.ts/.tsx/.mts/.cts) and normalize/realpath paths, which may surface new cycle warnings/errors, especially on Windows or mixed TS/JS projects.
