# @knighted/module 1.0.0 release notes

## Status

- Current candidate: 1.0.0-rc.0 (tag `latest` until final 1.0.0).
- Stability: API surface locked for 1.0.x; only bug fixes expected before GA.

## Requirements

- Node >= 22.21.1 (tested primarily on 22.x). Older LTS are not guaranteed; add matrix coverage if support is desired.

## Highlights

- Symmetric ESM↔CJS transforms with optioned behaviors:
  - `topLevelAwait`: `error` (default), `wrap`, `preserve` for CJS targets.
  - `importMetaMain`: `shim` (default), `warn`, `error` with Node version gate.
  - `liveBindings`: `strict` (default), `loose`, `off` for ESM→CJS.
  - `cjsDefault`: `auto` (default), `module-exports`, `none` for default import interop.
  - `rewriteSpecifier`: extension or callback-based specifier rewriting for both directions.
  - `requireSource`: `builtin` (default) or `create-require` fallback.
- Defensive handling: reject `with` / unshadowed `eval` when raising to ESM; reject shadowed `module`/`exports` in CJS lowering.
- Runtime coverage: fixtures and integration tests for **filename/**dirname/import.meta globals, `require.main` rewrites, TLA wrapping, namespace/default interop, export hoisting, and project-level conversions.

## Behavior guarantees

- Live bindings are strict by default for ESM→CJS; CJS→ESM rewrites avoid unsound cases by throwing on unsupported constructs.
- `import.meta` properties shimmed when targeting CJS; `import.meta.main` guarded by version-aware warnings/errors.
- Top-level await in CJS targets defaults to `error`; wrapping/preserve are opt-in and keep exports intact.

## Packaging and metadata

- Confirm `package.json` exports/fields (`main`, `exports`, `types`) match the build outputs.
- Dependencies: `oxc-parser`, `@babel/parser/traverse`, `magic-string`, `@knighted/specifier`, `@knighted/walk`, `node-module-type`.
- Consider source maps (not emitted today); document absence if deferring.

## Testing

- Lint: `npm run lint` (oxlint) — clean.
- Tests: `npm test` — ~98% statements, ~93% branches; format.ts 100% line coverage, remaining branches are defensive/unreachable.
- Add Node matrix if supporting additional runtimes before GA.

## Release steps to GA

1. Publish 1.0.0-rc.0 as `latest` (per plan); keep `next` if needed for future prereleases.
2. Monitor for regressions; if none, tag 1.0.0 with the same artifacts.
3. Update README and docs links to reference this release note; remove any “remaining gaps” language now that coverage is closed.
4. Add changelog entry summarizing changes since 1.0.0-alpha.8/1.0.0-beta.5.

## Open questions

- Do we want official support for Node 20/18? If yes, run matrix and adjust shims accordingly.
- CLI packaging: still library-only; document intentionally if not providing a CLI.
