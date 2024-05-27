# [`@knighted/module`](https://www.npmjs.com/package/@knighted/module)

![CI](https://github.com/knightedcodemonkey/module/actions/workflows/ci.yml/badge.svg)
[![codecov](https://codecov.io/gh/knightedcodemonkey/module/graph/badge.svg?token=AjayQQxghy)](https://codecov.io/gh/knightedcodemonkey/module)
[![NPM version](https://img.shields.io/npm/v/@knighted/module.svg)](https://www.npmjs.com/package/@knighted/module)

Node.js utility for transforming JavaScript or TypeScript files from one module system to another.

- ES module ➡️ CommonJS
- CommonJS ➡️ ES module

By default `@knighted/module` transforms globals from one module scope to another and returns the modified source, but it accepts options that allow

- Module loading transforms, i.e, `import`/`export` converted to `require`/`exports`
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

You can use transform it to the equivalent CommonJS module

```js
import { transform } from '@knighted/module'

await transform('./file.js', {
  type: 'commonjs'
  moduleLoading: true,
  out: './file.cjs'
})
```

Which produces

**file.js**

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
  moduleLoading?: boolean
  /* Whether to change specifier extensions to the assigned value. If omitted they are left alone. */
  specifiers?: '.js' | '.mjs' | '.cjs' | '.ts' | '.mts' | '.cts'
  /* What filepath to write the transformed source to. If omitted the transformed source is returned. */
  out?: string
}
```
