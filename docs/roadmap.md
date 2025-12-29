# Roadmap / Upcoming Enhancements

Status: draft

## Idiomatic Exports

Shipped: `idiomaticExports: 'safe'` is now the default for CJS → ESM, with fallback to the helper bag plus diagnostics when unsafe.

Next:

- Explore a true `'aggressive'` mode (mixed exports/module.exports, limited reassignments, identifier-safe computed keys) with guarded semantics and explicit diagnostics.
- Consider a constrained ESM → CJS “pretty” path where live-binding and TLA semantics permit it.

## CLI

- Deliver a `knighted-module` CLI that wraps the core transform with parity to API options (targets, rewriteSpecifier, appendJsExtension/appendDirectoryIndex, detectCircularRequires, topLevelAwait, cjsDefault, diagnostics hooks, out/in-place).
- Input handling: accept file/glob lists plus stdin/stdout piping; respect `package.json` `type` and `.cjs/.mjs` extensions; allow per-invocation overrides via flags and a config file.
- Output handling: in-place rewrite or out-dir mirroring with extension rewriting; emit diagnostics to stderr and machine-readable JSON when requested; non-zero exit on diagnostics of severity error.
- Performance ergonomics: batch parse/format where possible, optional concurrency flag, and a `--watch` mode that rebuilds on change with minimal restarts.
- DX: `--dry-run` to preview planned rewrites, `--list` to show which files would change, `--summary` to print counts of transformed specifiers/globals, and `--help`/`--version` aligned with package metadata.

## Tooling & Diagnostics

- Emit source maps and clearer diagnostics for transform choices.
- Benchmark scope analysis choices: compare `periscopic`, `scope-analyzer`, and `eslint-scope` on fixtures and pick the final adapter.
