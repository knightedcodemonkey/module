# [`@knighted/module`](https://www.npmjs.com/package/@knighted/module)

![CI](https://github.com/knightedcodemonkey/module/actions/workflows/ci.yml/badge.svg)
[![codecov](https://codecov.io/gh/knightedcodemonkey/module/graph/badge.svg?token=AjayQQxghy)](https://codecov.io/gh/knightedcodemonkey/module)
[![NPM version](https://img.shields.io/npm/v/@knighted/module.svg)](https://www.npmjs.com/package/@knighted/module)

Node.js utility for transforming a JavaScript or TypeScript file from an ES module to CommonJS, or vice versa.

- ES module ➡️ CommonJS
- CommonJS ➡️ ES module

Highlights

- Defaults to safe CommonJS output: strict live bindings, import.meta shims, and specifier preservation.
- Opt into stricter/looser behaviors: live binding enforcement, import.meta.main gating, and top-level await strategies.
- Can optionally rewrite relative specifiers and write transformed output to disk.

> [!IMPORTANT]  
> All parsing logic is applied under the assumption the code is in [strict mode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode) which [modules run under by default](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules#other_differences_between_modules_and_classic_scripts).

By default `@knighted/module` transforms the one-to-one [differences between ES modules and CommonJS](https://nodejs.org/api/esm.html#differences-between-es-modules-and-commonjs). Options let you control syntax rewriting, specifier updates, and output.

## Requirements

- Node >= 22.21.1

## Install

```bash
npm install @knighted/module
```

## Example

Given an ES module:

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

## Options

```ts
type ModuleOptions = {
  target: 'module' | 'commonjs'
  sourceType?: 'auto' | 'module' | 'commonjs'
  transformSyntax?: boolean
  liveBindings?: 'strict' | 'loose' | 'off'
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
  requireSource?: 'builtin' | 'create-require'
  cjsDefault?: 'module-exports' | 'auto' | 'none'
  topLevelAwait?: 'error' | 'wrap' | 'preserve'
  out?: string
  inPlace?: boolean
}
```

Behavior notes (defaults in parentheses)

- `target` (`commonjs`): output module system.
- `transformSyntax` (true): enable/disable the ESM↔CJS lowering pass.
- `liveBindings` (`strict`): getter-based live bindings, or snapshot (`loose`/`off`).
- `dirFilename` (`inject`): inject `__dirname`/`__filename`, preserve existing, or throw.
- `importMeta` (`shim`): rewrite `import.meta.*` to CommonJS equivalents.
- `importMetaMain` (`shim`): gate `import.meta.main` with shimming/warning/error when Node support is too old.
- `topLevelAwait` (`error`): throw, wrap, or preserve when TLA appears in CommonJS output.
- `rewriteSpecifier` (off): rewrite relative specifiers to a chosen extension or via a callback.
- `requireSource` (`builtin`): whether `require` comes from Node or `createRequire`.
- `cjsDefault` (`auto`): bundler-style default interop vs direct `module.exports`.
- `out`/`inPlace`: write the transformed code to a file; otherwise the function returns the transformed string only.
- CommonJS → ESM lowering will throw on `with` statements and unshadowed `eval` calls to avoid unsound rewrites.

See [docs/esm-to-cjs.md](docs/esm-to-cjs.md) for deeper notes on live bindings, interop helpers, top-level await behavior, and `import.meta.main` handling. For CommonJS to ESM lowering details, read [docs/cjs-to-esm.md](docs/cjs-to-esm.md).

## Roadmap

- Emit source maps and clearer diagnostics for transform choices.
- Broaden fixtures covering live-binding and top-level await edge cases across Node versions.
- Benchmark scope analysis choices: compare `periscopic`, `scope-analyzer`, and `eslint-scope` on fixtures and pick the final adapter.
