# Roadmap / Upcoming Enhancements

Status: draft

## Pretty Output Mode

Goal: Add an opt-in `pretty` (aka `idiomaticExports`) mode to reduce synthesized helper bags when converting between CJS and ESM.

### CJS → ESM

- Option: `pretty: 'safe' | 'aggressive'` (default: off).
- Safe mode rules (emit direct exports, avoid `__exports` when all are true):
  - Only top-level `exports.*` writes or a single `module.exports = { ... }` / `module.exports = fn`.
  - No reassignments after initial writes; no getters/setters; no computed/non-identifier keys; no mixed `exports` + `module.exports` unless we can rewrite deterministically.
  - No shadowed `module`/`exports`; no top-level `return`; no `require.cache/extensions`; no dynamic require inside export initializers; no TDZ hazards.
- Aggressive mode: allow mixed exports + `module.exports` if we can derive both default and named exports; allow identifier-safe computed keys; allow a single reassignment.
- Emission strategy:
  - Named writes → `export const foo = ...` or `export { local as foo }`.
  - `module.exports = { ... }` → `export default { ... }` (+ optional named re-exports for plain identifiers if a sub-option is enabled).
  - `module.exports = fn` → `export default fn`.
  - Fallback to `__exports` when rules fail.
- Diagnostics: warn when `pretty` requested but fell back; warn when live-binding fidelity may differ in aggressive mode.
- Tests: fixture matrix (safe object, safe function default, mixed exports+module.exports, computed keys, reassignments) with assertions on generated text (absence/presence of `__exports`) and runtime behavior.

### ESM → CJS

- Option: same `pretty` flag, but constrained by live bindings and TLA.
- Preconditions for pretty CJS:
  - `topLevelAwait === 'error'` or known-wrap path; `liveBindings !== 'strict'` (or accept relaxed semantics in aggressive mode).
  - No namespace exports requiring live getters; no export-all with live needs unless we accept relaxed semantics.
- Emission strategy when safe:
  - Direct `exports.foo = foo;` and `module.exports = default` without namespace helpers.
  - Avoid namespace helper when `export * as ns` can map to `const ns = require(...); exports.ns = ns;` under relaxed live-binding semantics.
  - Keep helpers for TLA wrap and strict live bindings.
- Tests: fixtures verifying helper-free output under safe conditions and fallback when constraints are present.

## Documentation & UX

- Note Node runtime floor (current package.json: Node >=22.21.1 <23 || >=24 <25) for `import.meta.*` support in generated code.
- Document diagnostics behavior when `pretty` cannot be applied.
- Consider a README section on “migration mode” describing pretty output trade-offs and when to avoid it.

## Next Steps

- Prototype CJS→ESM `pretty: 'safe'` path with fixtures and diagnostics.
- Evaluate surface area for ESM→CJS pretty mode; decide if it ships initially or stays experimental.
- Add CLI/API option plumbing and docs once behavior solidifies.
