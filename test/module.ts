import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { rm, stat, writeFile } from 'node:fs/promises'
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
  it.skip('transforms __filename', async t => {
    const result = await transform(join(fixtures, '__filename.cjs'), {
      type: 'module',
    })
    const outFile = join(fixtures, '__filename.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)

    assert.ok(result.indexOf('thing.__filename = filename') > -1)
    assert.ok(result.indexOf("other.thing.__filename = 'test'") > -1)
    assert.ok(result.indexOf('bar(__filename)') > -1)
    assert.equal([...result.matchAll(/const fn = __filename/g)].length, 2)
    assert.ok(result.indexOf(')(import.meta.url)') > -1)
    assert.ok(result.indexOf('import.meta.url === process.argv[1]') > -1)
    assert.ok(result.indexOf('baz.apply(null, [import.meta.url, a])') > -1)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
  })

  it.skip('transforms __dirname', async t => {
    const result = await transform(join(fixtures, '__dirname.cjs'), {
      type: 'module',
    })
    const outFile = join(fixtures, '__dirname.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)

    assert.ok(result.indexOf("other.thing.__dirname = 'test'") > -1)
    assert.ok(result.indexOf('thing.__dirname = dirname') > -1)
    assert.ok(result.indexOf('bar(__dirname)') > -1)
    assert.equal([...result.matchAll(/const fn = __dirname/g)].length, 2)
    assert.ok(result.indexOf(')(import.meta.dirname)') > -1)
    assert.ok(result.indexOf('import.meta.dirname === process.argv[1]') > -1)
    assert.ok(result.indexOf('baz.apply(null, [import.meta.dirname, a])') > -1)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
  })

  it.skip('transforms exports', async t => {
    const result = await transform(join(fixtures, 'exports.cjs'), {
      type: 'module',
      importsExports: true,
    })
    const outFile = join(fixtures, 'exports.mjs')

    t.after(() => {
      //rm(outFile, { force: true })
    })
    await writeFile(outFile, result)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
  })

  it.skip('transforms import.meta', async t => {
    const result = await transform(join(fixtures, 'import.meta.mjs'), {
      type: 'commonjs',
    })
    const outFile = join(fixtures, 'import.meta.cjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
  })

  it.skip('transforms import.meta.url', async t => {
    const result = await transform(join(fixtures, 'import.meta.url.mjs'), {
      type: 'commonjs',
    })
    const outFile = join(fixtures, 'import.meta.url.cjs')
    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)

    assert.ok(result.indexOf("Invalid assignment: 'foo' is not a URL.") > -1)
    assert.ok(
      result.indexOf(
        `require("node:url").pathToFileURL(__filename).href = 'file:///some/path/to/file.js'`,
      ) > -1,
    )
    assert.ok(result.indexOf('thing.import.meta.url = filename') > -1)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
  })

  it.skip('transforms import.meta.filename', async t => {
    const result = await transform(join(fixtures, 'import.meta.filename.mjs'), {
      type: 'commonjs',
    })
    const outFile = join(fixtures, 'import.meta.filename.cjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)

    assert.ok(result.indexOf('const filename = __filename') > -1)
    assert.ok(result.indexOf('thing.import.meta.filename = filename') > -1)
    assert.equal([...result.matchAll(/const fn = __filename/g)].length, 2)
    assert.ok(result.indexOf('foo(__filename)') > -1)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
  })

  it.skip('transforms import.meta.dirname', async t => {
    const result = await transform(join(fixtures, 'import.meta.dirname.mjs'), {
      type: 'commonjs',
    })
    const outFile = join(fixtures, 'import.meta.dirname.cjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)

    assert.ok(result.indexOf('const filename = __dirname') > -1)
    assert.ok(result.indexOf('thing.import.meta.dirname = filename') > -1)
    assert.equal([...result.matchAll(/const fn = __dirname/g)].length, 2)
    assert.ok(result.indexOf('foo(__dirname)') > -1)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
  })

  it.skip('transforms import.meta.resolve', async t => {
    const result = await transform(join(fixtures, 'import.meta.resolve.mjs'), {
      type: 'commonjs',
    })
    const outFile = join(fixtures, 'import.meta.resolve.cjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)

    assert.ok(result.indexOf("const path = require.resolve('./values.cjs')") > -1)
    assert.ok(result.indexOf('thing.import.meta.resolve = filename') > -1)
    assert.equal([...result.matchAll(/const fn = require.resolve/g)].length, 2)
    assert.ok(result.indexOf("require.resolve = 'file:///some/path/to/file.js'") > -1)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
  })

  it.skip('transforms es module globals to commonjs globals', async () => {
    const result = await transform(join(fixtures, 'file.mjs'), { type: 'commonjs' })

    assert.equal(result.indexOf('import.meta.url'), -1)
    assert.equal(result.indexOf('import.meta.filename'), -1)
    assert.equal(result.indexOf('import.meta.dirname'), -1)
    assert.equal(result.indexOf('import.meta.resolve'), -1)
    assert.ok(
      result.indexOf('require("node:url").pathToFileURL(__filename).toString()') > -1,
    )
    assert.ok(result.indexOf('__dirname') > -1)
    assert.ok(result.indexOf('__filename') > -1)
    assert.ok(result.indexOf('require.resolve(') > -1)
    // Check `import.meta` transformed into `module`
    assert.equal(/import\.meta\s/.test(result), false)
    assert.ok(/\smodule\s/.test(result))
  })

  it.skip('transforms commonjs globals to es module globals', async () => {
    const result = await transform(join(fixtures, 'file.cjs'), { type: 'module' })

    console.log(result)
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

  it.skip('updates specifiers when option enabled', async () => {
    const result = await transform(join(fixtures, 'specifier.mjs'), {
      type: 'commonjs',
      specifier: '.js',
    })
    const cjsResult = await transform(join(fixtures, 'specifier.cjs'), {
      type: 'module',
      specifier: '.mjs',
    })

    assert.equal((result.match(/\.\/file\.js/g) ?? []).length, 6)
    assert.equal((result.match(/require\.resolve\('\.\/file\.js'\)/g) ?? []).length, 2)
    assert.equal((cjsResult.match(/\.\/file\.mjs/g) ?? []).length, 3)
    assert.equal(
      (cjsResult.match(/import\.meta\.resolve\('\.\/file\.mjs'\)/g) ?? []).length,
      1,
    )
  })

  it.skip('writes transformed source to a file when option enabled', async t => {
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
