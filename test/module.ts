import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolve, join } from 'node:path'

import { transform } from '../src/module.js'

const fixtures = resolve(import.meta.dirname, 'fixtures')

describe('@knighted/module', () => {
  it('transforms es module scope globals to commonjs module scope globals', async () => {
    const result = await transform(join(fixtures, 'file.mjs'))

    assert.equal(result.indexOf('import.meta.url'), -1)
    assert.equal(result.indexOf('import.meta.filename'), -1)
    assert.equal(result.indexOf('import.meta.dirname'), -1)
    assert.equal(result.indexOf('import.meta.resolve'), -1)
    assert.ok(result.indexOf('require("node:url").pathToFileURL(__filename).toString()') > -1)
    assert.ok(result.indexOf('__dirname') > -1)
    assert.ok(result.indexOf('__filename') > -1)
    assert.ok(result.indexOf("require.resolve('./test.js')") > -1)
  })

  it('transforms some commonjs module scope globals to es module scope globals', async () => {
    const result = await transform(join(fixtures, 'file.cjs'), { type: 'module' })

    assert.equal(result.indexOf('__filename'), -1)
    assert.equal(result.indexOf('__dirname'), -1)
    assert.equal(result.indexOf('require.resolve'), -1)
    assert.ok(result.indexOf('import.meta.filename') > -1)
    assert.ok(result.indexOf('import.meta.dirname') > -1)
    assert.ok(result.indexOf('import.meta.resolve') > -1)
  })
})
