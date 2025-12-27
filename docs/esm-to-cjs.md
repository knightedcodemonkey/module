# ESM to CommonJS lowering

## Scope

- Translates ESM syntax to CommonJS when `target: 'commonjs'` with `transformSyntax` enabled.
- Assumes Node 20.11+ runtime with `__filename`/`__dirname` shims supplied by the host.
- Keeps optional live-binding behavior via `liveBindings` (strict/loose/off).

## Imports and interop

- `import` statements become `require` calls; side-effect imports become bare `require()` calls.
- Default imports use the bundler-style helper `__interopDefault = mod => (mod && mod.__esModule ? mod.default : mod)` when `cjsDefault: 'auto'`; otherwise they can target `module.exports` or `.default` directly per option.
- Namespace imports bind to the full `require` result; named imports destructure from the same binding.
- Re-exporting a default (`export { default as x } from`) routes through the interop helper to match bundler behavior for CJS sources.
- When the interop helper is emitted, `exports.__esModule = true` is also seeded for downstream consumers.

## Exports

- Local named exports emit to `exports.<name>` (or bracket access) with `Object.defineProperty` getters when `liveBindings: 'strict'`.
- `export default` writes to `module.exports = <expr>`; default functions/classes preserve their identifier before exporting.
- `export * from` lowers to a `for...in` over the required module, skipping `default`, guarding on `hasOwnProperty`, and defining getters to mirror live bindings.
- Named re-exports from another module (`export { foo as bar } from`) assign using either a direct property read or the interop helper for `default`.

## import.meta rewriting

- `import.meta.url` → `require("node:url").pathToFileURL(__filename).href`
- `import.meta.filename` → `__filename`
- `import.meta.dirname` → `__dirname`
- `import.meta.resolve` → `require.resolve`
- `import.meta.main` → `process.argv[1] === __filename`
- Bare `import.meta` becomes `module` so property accesses stay valid in CJS output.

## Fixtures for this phase

- `test/fixtures/esmDefault.mjs`: default import from the CJS provider, re-exported as default for interop checks (default import yields the CJS module object).
- `test/fixtures/esmNamed.mjs`: named import and aliasing from the CJS provider, re-exported for assertions.
- `test/fixtures/esmNamespace.mjs`: namespace import shape from the CJS provider, re-exported as `ns`.
- `test/fixtures/esmReexport.mjs`: named + star re-exports from the CJS provider (includes live binding passthrough).
- `test/fixtures/esmProvider.cjs`: CJS source exposing default/named exports plus a mutating `live` counter for binding checks (interval is `unref()`ed; tests wait ≥30ms to observe changes).
