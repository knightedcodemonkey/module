# [`@knighted/module`](https://www.npmjs.com/package/@knighted/module)

![CI](https://github.com/knightedcodemonkey/module/actions/workflows/ci.yml/badge.svg)
[![codecov](https://codecov.io/gh/knightedcodemonkey/module/graph/badge.svg?token=AjayQQxghy)](https://codecov.io/gh/knightedcodemonkey/module)
[![NPM version](https://img.shields.io/npm/v/@knighted/module.svg)](https://www.npmjs.com/package/@knighted/module)

Node.js utility for transforming a JavaScript or TypeScript file from an ES module to CommonJS, or vice versa.

- ES module ➡️ CommonJS
- CommonJS ➡️ ES module

> [!IMPORTANT]  
> All parsing logic is applied under the assumption the code is in [strict mode](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode) which [modules run under by default](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules#other_differences_between_modules_and_classic_scripts).

By default `@knighted/module` transforms the one-to-one [differences between ES modules and CommonJS](https://nodejs.org/api/esm.html#differences-between-es-modules-and-commonjs). Options let you control syntax rewriting, specifier updates, and output.

## Requirements

- Node >= 20.11.0

## Example

Given an ES module

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

You can transform it to the equivalent CommonJS module

```js
import { transform } from '@knighted/module'

await transform('./file.js', {
  target: 'commonjs',
  out: './file.cjs',
})
```

Which produces

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
  requireSource?: 'builtin' | 'create-require'
  cjsDefault?: 'module-exports' | 'auto' | 'none'
  topLevelAwait?: 'error' | 'wrap' | 'preserve'
  out?: string
  inPlace?: boolean
}
```

## Roadmap

- Remove `@knighted/specifier` and avoid double parsing.
- Flesh out live-binding and top-level await handling.
