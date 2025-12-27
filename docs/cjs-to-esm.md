# CommonJS to ESM lowering

## Scope

- Rewrites CommonJS modules to ESM when `target: 'module'` with `transformSyntax` enabled.
- Assumes Node 20.11+ runtime with native ESM.
- Skips lowering when `module` or `exports` are shadowed at module scope to avoid mis-compilation.
- Deprecated CJS features (`require.extensions`, `module.parent`, legacy folder-as-module resolution) are left as-is.

## Imports

- Top-level static `require()` (and `module.require()`) calls become hoisted ESM imports:
  - `const foo = require('./x')` → `import * as foo from './x'`
  - `const foo = module.require('./x')` → `import * as foo from './x'`
  - Multi-declarator: `const a = require('./x'), { foo } = require('./y')` → hoisted namespace imports plus destructuring from those namespaces.
  - `require('./x')` → `import './x'`
- Dynamic/templated/non-literal `require()` calls (or any require that isn't hoistable) stay as-is and trigger a `createRequire` shim:
  - `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);`
  - Nested or block-scoped `require()` calls also stay under `createRequire` and execute at runtime.
- `require.main` maps to `import.meta.main`; comparisons against `module` are simplified to `import.meta.main` / `!import.meta.main`.
- `require.resolve` is rewritten to `import.meta.resolve` via the member-expression formatter.
- `require.cache` becomes an empty object placeholder; `require.extensions` is not rewritten (deprecated).

## Exports

- `exports`/`module.exports` assignments are rewritten to an internal `__exports` object.
- Export metadata is collected to emit real ESM exports at the end of the file:
  - Default export synthesized when `module.exports = ...` is found.
  - Named exports emitted for `exports.foo = ...`, `Object.assign(exports, {...})`, `Object.defineProperty`, etc.
- Shadowed `module`/`exports` bindings cause the transform to throw to avoid emitting invalid exports.
- Exports inside simple control flow are collected and re-exported; hoisting preserves the original runtime writes on `__exports`.

## Runtime notes

- `__filename`/`__dirname` become `import.meta.url`/`import.meta.dirname` in ESM output.
- `import.meta.filename` seeding ensures `import.meta` is present even if unused in source.
- Live-binding semantics for exports are preserved to the extent they exist in the source; assignments remain on `__exports` and are re-exported by reference.
- Conditional or runtime-dependent `require()` calls are not hoisted; they continue to execute at runtime under `createRequire`.
