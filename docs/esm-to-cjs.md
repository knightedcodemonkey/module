# ESM to CommonJS lowering

## Scope

- Translates ESM syntax to CommonJS when `target: 'commonjs'` with `transformSyntax` enabled.
- Assumes Node 22.21+ runtime with `__filename`/`__dirname` shims supplied by the host (matches package engines).
- Keeps optional live-binding behavior via `liveBindings` (strict/loose/off).
- Top-level await (TLA) handling is controlled by `topLevelAwait: 'error' | 'wrap' | 'preserve'` when lowering to CommonJS.
- Optional import.meta.main gating via `importMetaMain: 'shim' | 'warn' | 'error'`.

## Imports and interop

- `import` statements become `require` calls; side-effect imports become bare `require()` calls.
- Default imports use the bundler-style helper `__interopDefault = mod => (mod && mod.__esModule ? mod.default : mod)` when `cjsDefault: 'auto'`; otherwise they can target `module.exports` or `.default` directly per option.
- Namespace imports bind to the full `require` result; named imports destructure from the same binding.
- Re-exporting a default (`export { default as x } from`) routes through the interop helper to match bundler behavior for CJS sources.
- When the interop helper is emitted, `exports.__esModule = true` is also seeded for downstream consumers.

## Exports and live bindings

- Local named exports emit to `exports.<name>` (or bracket access) with `Object.defineProperty` getters when `liveBindings: 'strict'`; snapshot assignment is used for `loose`/`off`.
- `export default` writes to `module.exports = <expr>` in the common case; when TLA is present and allowed (`wrap`/`preserve`), default exports write to `exports.default = <expr>` so the exports object stays stable for async wrapping.
- `export * from` lowers to a `for...in` over the required module, skipping `default`, guarding on `hasOwnProperty`, and defining getters to mirror live bindings.
- Named re-exports from another module (`export { foo as bar } from`) use getters when `liveBindings: 'strict'`, otherwise snapshot assignment; `default` re-exports still use the interop helper.

## Top-level await

- `topLevelAwait: 'error'` (default) throws during transform when a TLA is found while targeting CommonJS.
- `topLevelAwait: 'wrap'` wraps the entire CJS output in `const __tla = (async () => { ...; return module.exports; })();` and attaches `__tla` to both `module.exports` and the resolved value. Consumers can await `require('./file').__tla` for readiness.
- `topLevelAwait: 'preserve'` runs the lowered code inside an immediately-invoked async function but does not attach a promise; consumers must rely on the natural scheduling of async effects.
- In both allowed modes, default exports write to `exports.default` instead of replacing `module.exports` to keep the exports object consistent while async initialization completes.
- Fixture: `test/fixtures/topLevelAwait.mjs` plus tests in `test/module.ts` cover both `wrap` and `preserve` behaviors.

## import.meta rewriting

- `import.meta.url` → `require("node:url").pathToFileURL(__filename).href`
- `import.meta.filename` → `__filename`
- `import.meta.dirname` → `__dirname`
- `import.meta.resolve` → `require.resolve`
- `import.meta.main` → configurable: default shim to `process.argv[1] === __filename`; with `importMetaMain: 'warn'` a warning is embedded for Node <22.18/24.2; with `importMetaMain: 'error'` the transform throws on those runtimes.
- Bare `import.meta` becomes `module` so property accesses stay valid in CJS output.

## Fixtures for this phase

- `test/fixtures/esmDefault.mjs`: default import from the CJS provider, re-exported as default for interop checks (default import yields the CJS module object).
- `test/fixtures/esmNamed.mjs`: named import and aliasing from the CJS provider, re-exported for assertions.
- `test/fixtures/esmNamespace.mjs`: namespace import shape from the CJS provider, re-exported as `ns`.
- `test/fixtures/esmReexport.mjs`: named + star re-exports from the CJS provider (includes live binding passthrough).
- `test/fixtures/liveReexport.mjs`: re-export from a mutating CJS source; exercised when `liveBindings: 'strict'` to verify getter-based live bindings.
- `test/fixtures/esmProvider.cjs`: CJS source exposing default/named exports plus a mutating `live` counter for binding checks (interval is `unref()`ed; tests wait ≥30ms to observe changes).
