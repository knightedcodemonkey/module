# CommonJS to ESM lowering

## Scope

- Rewrites CommonJS modules to ESM when `target: 'module'` with `transformSyntax` enabled.
- Assumes Node 20.11+ runtime with native ESM.
- Skips lowering when `module` or `exports` are shadowed at module scope to avoid mis-compilation.

## Imports

- Top-level static `require()` calls become hoisted ESM imports:
  - `const foo = require('./x')` → `import * as foo from './x'`
  - `const { foo } = require('./x')` → `import * as __cjsImport0 from './x'; const { foo } = __cjsImport0;`
  - `require('./x')` → `import './x'`
- Dynamic/templated `require()` calls stay as-is and trigger a `createRequire` shim:
  - `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);`
- `require.resolve` is still rewritten to `import.meta.resolve` via the member-expression formatter.

## Exports

- `exports`/`module.exports` assignments are rewritten to an internal `__exports` object.
- Export metadata is collected to emit real ESM exports at the end of the file:
  - Default export synthesized when `module.exports = ...` is found.
  - Named exports emitted for `exports.foo = ...`, `Object.assign(exports, {...})`, `Object.defineProperty`, etc.
- Shadowed `module`/`exports` bindings cause the transform to throw to avoid emitting invalid exports.

## Runtime notes

- `__filename`/`__dirname` become `import.meta.url`/`import.meta.dirname` in ESM output.
- `import.meta.filename` seeding ensures `import.meta` is present even if unused in source.
- Live-binding semantics for exports are preserved to the extent they exist in the source; assignments remain on `__exports` and are re-exported by reference.
