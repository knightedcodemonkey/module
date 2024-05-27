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
    // Check `import.meta` transformation
    assert.equal(/import\.meta\s/.test(result), false)
    assert.ok(result.indexOf('require.main') > -1)
  })

  it('transforms commonjs module scope globals to es module scope globals', async () => {
    const result = await transform(join(fixtures, 'file.cjs'), { type: 'module' })

    assert.equal(result.indexOf('__filename'), -1)
    assert.equal(result.indexOf('__dirname'), -1)
    assert.equal(result.indexOf('require.resolve'), -1)
    assert.ok(result.indexOf('import.meta.filename') > -1)
    assert.ok(result.indexOf('import.meta.dirname') > -1)
    assert.ok(result.indexOf('import.meta.resolve') > -1)
    // Check `module`, `exports` and `require.cache`
    assert.equal(!/module\s/.test(result), true)
    assert.equal(!/\sexports\s/.test(result), true)
    assert.equal(result.indexOf('require.cache'), -1)
    assert.equal(/import\.meta\s/.test(result), true)
    assert.ok(result.indexOf('{}') > -1)
  })
})
