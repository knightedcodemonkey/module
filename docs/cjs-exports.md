# CommonJS export discovery

## Supported patterns

- `module.exports = value` → captured as default; if assigned an identifier, we re-use it, otherwise we export the `__exports` bag. Overwrite-then-augment flows like `module.exports = fn; module.exports.extra = 1` are supported.
- Property writes: `exports.foo = x`, `module.exports.bar = y`, and computed literals like `exports['foo']`, `exports[42]`, `module.exports[`template`]`.
- Aliases to the export bag: `const e = exports; e.foo = 1`, `const m = module.exports; m.bar = 2` (alias chains are tracked).
- Destructuring to properties: `({ value: exports.foo } = obj)`.
- `Object.assign(exports, { foo, bar: baz })` and `Object.assign(module.exports, { ... })` with literal keys.
- `Object.defineProperty` / `Object.defineProperties` on exports/module.exports (aliases included) with literal keys; value and getter descriptors are collected. Getter-based exports are emitted via a proxy read (best-effort, not true ESM live bindings).

## Ignored or intentionally excluded

- Non-literal computed keys (e.g., `exports[key()] = x`) are ignored for static export emission; they may still exist on the runtime bag but no ESM binding is generated.
- Symbol keys on exports/module.exports are ignored.
- Patterns that do not resolve to `exports`/`module.exports` or aliases are ignored.

## Emission rules

- We rename the CJS surface to `__exports` and emit ESM bindings from the collected table.
- Default export: `module.exports = id` emits `export default id`; otherwise `export default __exports`.
- Named exports reuse identifiers when available; otherwise we create a temporary binding that reads from `__exports` (using bracket access for non-identifier names).

## Testing strategy

- Fixtures cover each supported pattern: computed literals, alias chains, destructuring, Object.assign fan-out, overwrite-then-augment sequences, and defineProperty/defineProperties (value + getter). Dynamic non-literal keys have a fixture to verify they remain un-exported.
- Alias-chain fixture covers `module.exports` aliases plus subsequent `exports` writes to ensure both surfaces stay connected.
- Each transformed fixture is executed with Node before assertions to catch runtime/syntax issues, then its exports are asserted via ESM import.
