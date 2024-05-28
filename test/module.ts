import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolve, join } from 'node:path'
import { rm, stat } from 'node:fs/promises'
import type { Stats } from 'node:fs'

import { transform } from '../src/module.js'

const fixtures = resolve(import.meta.dirname, 'fixtures')
const isValidFilename = async (filename: string) => {
  let stats: Stats

  try {
    stats = await stat(filename)
  } catch {
    return false
  }

  if (!stats.isFile()) {
    return false
  }

  return true
}

describe('@knighted/module', () => {
  it('transforms es module globals to commonjs globals', async () => {
    const result = await transform(join(fixtures, 'file.mjs'))

    assert.equal(result.indexOf('import.meta.url'), -1)
    assert.equal(result.indexOf('import.meta.filename'), -1)
    assert.equal(result.indexOf('import.meta.dirname'), -1)
    assert.equal(result.indexOf('import.meta.resolve'), -1)
    assert.ok(result.indexOf('require("node:url").pathToFileURL(__filename).toString()') > -1)
    assert.ok(result.indexOf('__dirname') > -1)
    assert.ok(result.indexOf('__filename') > -1)
    assert.ok(result.indexOf('require.resolve(') > -1)
    // Check `import.meta` transformation
    assert.equal(/import\.meta\s/.test(result), false)
    assert.ok(result.indexOf('require.main') > -1)
  })

  it('transforms commonjs globals to es module globals', async () => {
    const result = await transform(join(fixtures, 'file.cjs'), { type: 'module' })

    assert.equal(result.indexOf('__filename'), -1)
    assert.equal(result.indexOf('__dirname'), -1)
    assert.equal(result.indexOf('require.resolve'), -1)
    assert.ok(result.indexOf('import.meta.filename') > -1)
    assert.ok(result.indexOf('import.meta.dirname') > -1)
    assert.ok(result.indexOf('import.meta.resolve') > -1)
    // Check `module`, `exports` and `require.cache`
    assert.equal(!/\smodule\s/.test(result), true)
    assert.equal(!/\sexports\s/.test(result), true)
    assert.equal(result.indexOf('require.cache'), -1)
    assert.equal(/import\.meta\s/.test(result), true)
    assert.ok(result.indexOf('{}') > -1)
  })

  it('updates specifiers when option enabled', async () => {
    const result = await transform(join(fixtures, 'specifier.mjs'), { specifier: '.js' })
    const cjsResult = await transform(join(fixtures, 'specifier.cjs'), { type: 'module', specifier: '.mjs' })

    assert.equal((result.match(/\.\/file\.js/g) ?? []).length, 6)
    assert.equal((result.match(/require\.resolve\('\.\/file\.js'\)/g) ?? []).length, 2)
    assert.equal((cjsResult.match(/\.\/file\.mjs/g) ?? []).length, 3)
    assert.equal((cjsResult.match(/import\.meta\.resolve\('\.\/file\.mjs'\)/g) ?? []).length, 1)
  })

  it('writes transformed source to a file when option enabled', async t => {
    const mjs = join(fixtures, 'transformed.mjs')
    const cjs = join(fixtures, 'transformed.cjs')

    t.after(() => {
      rm(mjs, { force: true })
      rm(cjs, { force: true })
    })

    await transform(join(fixtures, 'file.mjs'), { type: 'commonjs', out: cjs })
    await transform(join(fixtures, 'file.cjs'), { type: 'module', out: mjs })

    assert.equal(await isValidFilename(mjs), true)
    assert.equal(await isValidFilename(cjs), true)

    // When option `modules` is complete
    /*
    // Check for runtime errors against Node.js
    const { status: statusEsm } = spawnSync(
      'node',
      [mjs],
      { stdio: 'inherit' },
    )
    assert.equal(statusEsm, 0)

    const { status: statusCjs } = spawnSync(
      'node',
      [cjs],
      { stdio: 'inherit' },
    )
    assert.equal(statusCjs, 0)
    */
  })
})
