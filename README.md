# [`@knighted/module`](https://www.npmjs.com/package/@knighted/module)

![CI](https://github.com/knightedcodemonkey/module/actions/workflows/ci.yml/badge.svg)
[![codecov](https://codecov.io/gh/knightedcodemonkey/module/graph/badge.svg?token=AjayQQxghy)](https://codecov.io/gh/knightedcodemonkey/module)
[![NPM version](https://img.shields.io/npm/v/@knighted/module.svg)](https://www.npmjs.com/package/@knighted/module)

Node.js utility for transforming a JavaScript or TypeScript file from an ES module to CommonJS, or vice versa.

- ES module ➡️ CommonJS
- CommonJS ➡️ ES module

By default `@knighted/module` transforms the one-to-one [differences between ES modules and CommonJS](https://nodejs.org/api/esm.html#differences-between-es-modules-and-commonjs), but it also accepts options that allow:

- Converting `import`/`export` to `require`/`exports`
- Extensions to be updated in relative specifiers
- Write transformed source code to a filename

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
  type: 'commonjs'
  moduleLoading: true,
  out: './file.cjs'
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

  if (require('node:url').pathToFileURL(__filename).toString() === pathToFileURL(realPath).href) {
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
  /* What module system to convert to. */
  type?: 'module' | 'commonjs'
  /* Whether import/export and require/exports should be transformed. */
  modules?: boolean
  /* Whether to change specifier extensions to the assigned value. If omitted they are left alone. */
  specifier?: '.js' | '.mjs' | '.cjs' | '.ts' | '.mts' | '.cts'
  /* What filepath to write the transformed source to. */
  out?: string
}
```

## Roadmap

- Support option `modules`.
- Remove `@knighted/specifier` and avoid double parsing.
