# [`@knighted/module`](https://www.npmjs.com/package/@knighted/module)

![CI](https://github.com/knightedcodemonkey/module/actions/workflows/ci.yml/badge.svg)
[![codecov](https://codecov.io/gh/knightedcodemonkey/module/graph/badge.svg?token=AjayQQxghy)](https://codecov.io/gh/knightedcodemonkey/module)
[![NPM version](https://img.shields.io/npm/v/@knighted/module.svg)](https://www.npmjs.com/package/@knighted/module)

Node.js utility for transforming a JavaScript or TypeScript file from an ES module to CommonJS, or vice versa.

- ES module ➡️ CommonJS
- CommonJS ➡️ ES module

Highlights

- ESM ➡️ CJS and CJS ➡️ ESM with one function call.
- Defaults to safe CommonJS output: strict live bindings, import.meta shims, and specifier preservation.
- Configurable lowering modes: full syntax transforms or globals-only.
- Specifier tools: add extensions, add directory indexes, or map with a custom callback.
- Output control: write to disk (`out`/`inPlace`) or return the transformed string.

> [!IMPORTANT]  
> All parsing logic is applied under the assumption the code is in [strict mode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode) which [modules run under by default](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules#other_differences_between_modules_and_classic_scripts).

By default `@knighted/module` transforms the one-to-one [differences between ES modules and CommonJS](https://nodejs.org/api/esm.html#differences-between-es-modules-and-commonjs). Options let you control syntax rewriting (full vs globals-only), specifier updates, and output.

## Requirements

- Node 22 or 24 (tested on 22.21.1 and 24.11.1)

## Install

```bash
npm install @knighted/module
```

## Quick examples

ESM ➡️ CJS:

**file.js**

```js
import { argv } from 'node:process'
import { pathToFileURL } from 'node:url'
import { realpath } from 'node:fs/promises'

const detectCalledFromCli = async path => {
  const realPath = await realpath(path)

  if (import.meta.url === pathToFileURL(realPath).href) {
    console.log('invoked directly by node')
  }
}

detectCalledFromCli(argv[1])
```

Transform it to CommonJS:

```js
import { transform } from '@knighted/module'

await transform('./file.js', {
  target: 'commonjs',
  out: './file.cjs',
})
```

Which produces:

**file.cjs**

```js
const { argv } = require('node:process')
const { pathToFileURL } = require('node:url')
const { realpath } = require('node:fs/promises')

const detectCalledFromCli = async path => {
  const realPath = await realpath(path)

  if (
    require('node:url').pathToFileURL(__filename).toString() ===
    pathToFileURL(realPath).href
  ) {
    console.log('invoked directly by node')
  }
}

detectCalledFromCli(argv[1])
```

When executed from the CLI

```console
use@computer: $ node file.cjs
invoked directly by node
```

CJS ➡️ ESM:

```js
import { transform } from '@knighted/module'

await transform('./file.cjs', {
  target: 'module',
  out: './file.mjs',
})
```

## Options

```ts
type ModuleOptions = {
  target: 'module' | 'commonjs'
  sourceType?: 'auto' | 'module' | 'commonjs'
  transformSyntax?: boolean | 'globals-only'
  liveBindings?: 'strict' | 'loose' | 'off'
  appendJsExtension?: 'off' | 'relative-only' | 'all'
  appendDirectoryIndex?: string | false
  rewriteSpecifier?:
    | '.js'
    | '.mjs'
    | '.cjs'
    | '.ts'
    | '.mts'
    | '.cts'
    | ((value: string) => string | null | undefined)
  dirFilename?: 'inject' | 'preserve' | 'error'
  importMeta?: 'preserve' | 'shim' | 'error'
  importMetaMain?: 'shim' | 'warn' | 'error'
  requireMainStrategy?: 'import-meta-main' | 'realpath'
  detectCircularRequires?: 'off' | 'warn' | 'error'
  requireSource?: 'builtin' | 'create-require'
  importMetaPrelude?: 'off' | 'auto' | 'on'
  cjsDefault?: 'module-exports' | 'auto' | 'none'
  idiomaticExports?: 'off' | 'safe' | 'aggressive'
  topLevelAwait?: 'error' | 'wrap' | 'preserve'
  out?: string
  inPlace?: boolean
}
```

### Behavior notes (defaults in parentheses)

- `target` (`commonjs`): output module system.
- `transformSyntax` (true): enable/disable the ESM↔CJS lowering pass; set to `'globals-only'` to rewrite module globals (`import.meta.*`, `__dirname`, `__filename`, `require.main` shims) while leaving import/export syntax untouched. In `'globals-only'`, no helpers are injected (e.g., `__requireResolve`), `require.resolve` rewrites to `import.meta.resolve`, and `idiomaticExports` is skipped. See [globals-only](#globals-only-scope).
- `liveBindings` (`strict`): getter-based live bindings, or snapshot (`loose`/`off`).
- `appendJsExtension` (`relative-only` when targeting ESM): append `.js` to relative specifiers; never touches bare specifiers.
- `appendDirectoryIndex` (`index.js`): when a relative specifier ends with a slash, append this index filename (set `false` to disable).
- `appenders` precedence: `rewriteSpecifier` runs first; if it returns a string, that result is used. If it returns `undefined` or `null`, `appendJsExtension` and `appendDirectoryIndex` still run. Bare specifiers are never modified by appenders.
- `dirFilename` (`inject`): inject `__dirname`/`__filename`, preserve existing, or throw.
- `importMeta` (`shim`): rewrite `import.meta.*` to CommonJS equivalents.
- `importMetaMain` (`shim`): gate `import.meta.main` with shimming/warning/error when Node support is too old.
- `requireMainStrategy` (`import-meta-main`): use `import.meta.main` or the realpath-based `pathToFileURL(realpathSync(process.argv[1])).href` check.
- `importMetaPrelude` (`auto`): emit a no-op `void import.meta.filename;` touch. `on` always emits; `off` never emits; `auto` emits only when helpers that reference `import.meta.*` are synthesized (e.g., `__dirname`/`__filename` in CJS→ESM, require-main shims, createRequire helpers). Useful for bundlers/transpilers that do usage-based `import.meta` polyfilling.
- `detectCircularRequires` (`off`): optionally detect relative static require cycles and warn/throw.
- `topLevelAwait` (`error`): throw, wrap, or preserve when TLA appears in CommonJS output.
- `rewriteSpecifier` (off): rewrite relative specifiers to a chosen extension or via a callback. Precedence: the callback (if provided) runs first; if it returns a string, that wins. If it returns `undefined` or `null`, the appenders still apply.
- `requireSource` (`builtin`): whether `require` comes from Node or `createRequire`.
- `cjsDefault` (`auto`): bundler-style default interop vs direct `module.exports`.
- `idiomaticExports` (`safe`): when raising CJS to ESM, attempt to synthesize `export` statements directly when it is safe. `off` always uses the helper bag; `aggressive` currently matches `safe` heuristics.
- `out`/`inPlace`: write the transformed code to a file; otherwise the function returns the transformed string only.
- CommonJS → ESM lowering will throw on `with` statements and unshadowed `eval` calls to avoid unsound rewrites.

> [!NOTE]
> Package-level metadata (`package.json` updates such as setting `"type": "module"` or authoring `exports`) is not edited by this tool today; plan that change outside the per-file transform.

See [docs/esm-to-cjs.md](docs/esm-to-cjs.md) for deeper notes on live bindings, interop helpers, top-level await behavior, and `import.meta.main` handling. For CommonJS to ESM lowering details, read [docs/cjs-to-esm.md](docs/cjs-to-esm.md).

> [!NOTE]
> Known limitations: `with` and unshadowed `eval` are rejected when raising CJS to ESM because the rewrite would be unsound; bare specifiers are not rewritten—only relative specifiers participate in `rewriteSpecifier`.

### Globals-only scope

- Rewrites module globals (`import.meta.*`, `__dirname`, `__filename`, `require.main` shims) for the target side.
- Optional specifier rewrites still run (`rewriteSpecifier`, `appendJsExtension`, `appendDirectoryIndex`).
- Leaves imports/exports and interop untouched (no export bag, no idiomaticExports, no live-binding synthesis, no helpers like `__requireResolve`).
- CJS→ESM: `require.resolve` maps to `import.meta.resolve` (URL return, ESM resolver) and may differ from CJS resolution. ESM→CJS: `import.meta` maps to CJS globals; no import lowering.

### Diagnostics callback example

Pass a `diagnostics` callback to surface CJS→ESM edge cases (mixed `module.exports`/`exports`, top-level `return`, legacy `require.cache`/`require.extensions`, live-binding reassignments, string-literal export names):

```ts
import { transform } from '@knighted/module'

const diagnostics: any[] = []

await transform('./file.cjs', {
  target: 'module',
  diagnostics: diag => diagnostics.push(diag),
})

console.log(diagnostics)
// [
//   {
//     level: 'warning',
//     code: 'cjs-mixed-exports',
//     message: 'Both module.exports and exports are assigned in this module; CommonJS shadowing may not match synthesized ESM exports.',
//     filePath: './file.cjs',
//     loc: { start: 12, end: 48 }
//   },
//   ...
// ]
```

> [!WARNING]
> When raising CommonJS to ESM, synthesized named exports rely on literal keys and `const` literal aliases (e.g., `const key = 'foo'; exports[key] = value`). `var`/`let` bindings used as export keys are not tracked, so prefer direct property names or `const` literals when exporting.

## Pre-`tsc` transforms for TypeScript diagnostics

TypeScript reports asymmetric module-global errors (e.g., `import.meta` in CJS, `__dirname` in ESM) as tracked in [microsoft/TypeScript#58658](https://github.com/microsoft/TypeScript/issues/58658). You can mitigate this by running `@knighted/module` **before** `tsc` so the checker sees already-rewritten sources. For a specifier + globals-only pass that leaves import/export syntax for `tsc`, set `transformSyntax: 'globals-only'`.

Minimal flow:

```js
import { glob } from 'glob'
import { transform } from '@knighted/module'

const files = await glob('src/**/*.{ts,js,mts,cts}', { ignore: 'node_modules/**' })

for (const file of files) {
  await transform(file, {
    target: 'commonjs', // or 'module' when raising CJS → ESM
    inPlace: true,
    transformSyntax: true,
  })
}
// then run `tsc`
```

This pre-`tsc` step removes the flagged globals in the compiled orientation; runtime semantics still match the target build.
