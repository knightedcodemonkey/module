import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { rm, stat, writeFile } from 'node:fs/promises'
import type { Stats } from 'node:fs'

import { transform } from '../src/module.js'

const fixtures = resolve(import.meta.dirname, 'fixtures')
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
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
  it('transforms __filename', async t => {
    const result = await transform(join(fixtures, '__filename.cjs'), {
      target: 'module',
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

  it('transforms __dirname', async t => {
    const result = await transform(join(fixtures, '__dirname.cjs'), {
      target: 'module',
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

  it('transforms exports', async t => {
    const fixturePath = join(fixtures, 'exports.cjs')
    const result = await transform(fixturePath, {
      target: 'module',
    })
    const outFile = join(fixtures, 'exports.mjs')
    const { status: statusIn } = spawnSync('node', [fixturePath], {
      stdio: 'inherit',
    })

    t.after(() => {
      rm(outFile, { force: true })
    })

    assert.equal(statusIn, 0)
    await writeFile(outFile, result)

    const { status: statusOut } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(statusOut, 0)
  })

  const exportFixtures: Array<{
    name: string
    file: string
    expect?: Record<string, string | number>
    verify?: (mod: Record<string, any>) => void
  }> = [
    {
      name: 'exportsComputed',
      file: 'exportsComputed.cjs',
      expect: { foo: 'alpha', '42': 'num', bar: 'beta', dyn: 'gamma' },
    },
    {
      name: 'exportsDynamicComputed',
      file: 'exportsDynamicComputed.cjs',
      verify: mod => {
        assert.equal(mod.static, 'ok')
        assert.equal(Object.prototype.hasOwnProperty.call(mod, 'dyn'), false)
      },
    },
    {
      name: 'exportsAlias',
      file: 'exportsAlias.cjs',
      expect: { foo: 1, bar: 2, baz: 3 },
    },
    {
      name: 'exportsAliasChain',
      file: 'exportsAliasChain.cjs',
      expect: { foo: 1, bar: 2 },
    },
    {
      name: 'exportsAssign',
      file: 'exportsAssign.cjs',
      verify: mod => {
        assert.equal(typeof mod.default, 'function')
        assert.equal(mod.default(), 'ok')
        assert.equal(mod.extra, 'value')
      },
    },
    {
      name: 'exportsAugment',
      file: 'exportsAugment.cjs',
      verify: mod => {
        assert.equal(typeof mod.default, 'function')
        assert.equal(mod.default(), 'ok')
        assert.equal(mod.extra, 1)
      },
    },
    {
      name: 'exportsDefineProperty',
      file: 'exportsDefineProperty.cjs',
      expect: { foo: 'bar', baz: 2 },
    },
    {
      name: 'exportsDefineGetter',
      file: 'exportsDefineGetter.cjs',
      expect: { next: 1 },
    },
    {
      name: 'exportsDefineProperties',
      file: 'exportsDefineProperties.cjs',
      expect: { alpha: 'ok', beta: 'ok!' },
    },
    {
      name: 'exportsDestructure',
      file: 'exportsDestructure.cjs',
      expect: { alpha: 'A', beta: 'B', foo: 1 },
    },
    {
      name: 'exportsObjectAssign',
      file: 'exportsObjectAssign.cjs',
      expect: { foo: 'x', bar: 'y', baz: 'z' },
    },
  ]

  exportFixtures.forEach(({ name, file, expect, verify }) => {
    it(`transforms ${name}`, async t => {
      const fixturePath = join(fixtures, file)
      const result = await transform(fixturePath, {
        target: 'module',
      })
      const outFile = join(fixtures, `${file.replace('.cjs', '')}.mjs`)
      const { status: statusIn } = spawnSync('node', [fixturePath], {
        stdio: 'inherit',
      })

      t.after(() => {
        rm(outFile, { force: true })
      })

      assert.equal(statusIn, 0)
      await writeFile(outFile, result)

      const { status: statusOut } = spawnSync('node', [outFile], { stdio: 'inherit' })
      assert.equal(statusOut, 0)

      const exportsObj = await import(pathToFileURL(outFile).href)

      if (verify) {
        verify(exportsObj as any)
        return
      }

      if (expect) {
        Object.entries(expect).forEach(([k, v]) => {
          assert.equal((exportsObj as any)[k], v)
        })
      }
    })
  })

  const transformEsmToCjs = async (t: any, file: string) => {
    const fixturePath = join(fixtures, file)
    const result = await transform(fixturePath, { target: 'commonjs' })
    const outFile = join(fixtures, `${file.replace('.mjs', '')}.out.cjs`)
    const requireCjs = createRequire(import.meta.url)

    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)
    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
    const exportsObj = requireCjs(outFile)

    return { exportsObj, result }
  }

  it('lowers default import with interop when targeting commonjs', async t => {
    const { exportsObj, result } = await transformEsmToCjs(t, 'esmDefault.mjs')

    assert.equal(exportsObj.default, 'default-val')
    assert.equal(exportsObj.foo, 'foo-val')
    assert.equal(exportsObj.bar, 'bar-val')
    assert.ok(result.indexOf('__interopDefault') > -1)
    assert.ok(result.indexOf('exports.__esModule = true') > -1)
  })

  it('lowers named imports when targeting commonjs', async t => {
    const { exportsObj } = await transformEsmToCjs(t, 'esmNamed.mjs')

    assert.equal(exportsObj.foo, 'foo-val')
    assert.equal(exportsObj.baz, 'bar-val')
  })

  it('lowers namespace imports when targeting commonjs', async t => {
    const { exportsObj } = await transformEsmToCjs(t, 'esmNamespace.mjs')

    assert.equal(exportsObj.ns.default, 'default-val')
    assert.equal(exportsObj.ns.foo, 'foo-val')
    assert.equal(exportsObj.ns.bar, 'bar-val')
  })

  it('preserves re-exports and live bindings from commonjs sources', async t => {
    const { exportsObj } = await transformEsmToCjs(t, 'esmReexport.mjs')

    assert.equal(exportsObj.renamed, 'foo-val')

    const first = exportsObj.live
    await delay(30)
    const second = exportsObj.live

    assert.ok(second > first)
  })

  it('preserves live re-exports when liveBindings is strict', async t => {
    const fixturePath = join(fixtures, 'liveReexport.mjs')
    const outFile = join(fixtures, 'liveReexport.out.cjs')
    const requireCjs = createRequire(import.meta.url)

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, {
      target: 'commonjs',
      liveBindings: 'strict',
    })

    await writeFile(outFile, result)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    const mod = requireCjs(outFile)
    assert.equal(mod.counter, 0)
    mod.bump()
    assert.equal(mod.counter, 1)
    await delay(30)
    assert.ok(mod.counter >= 2)
  })

  it('transforms import.meta', async t => {
    const result = await transform(join(fixtures, 'import.meta.mjs'), {
      target: 'commonjs',
    })
    const outFile = join(fixtures, 'import.meta.cjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
  })

  it('transforms import.meta.url', async t => {
    const result = await transform(join(fixtures, 'import.meta.url.mjs'), {
      target: 'commonjs',
    })
    const outFile = join(fixtures, 'import.meta.url.cjs')
    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)

    assert.ok(result.indexOf("Invalid assignment: 'foo' is not a URL.") > -1)
    assert.ok(
      result.indexOf('pathToFileURL(__filename).href =') > -1 &&
        result.indexOf('file:///some/path/to/file.js') > -1,
    )
    assert.ok(result.indexOf('thing.import.meta.url = filename') > -1)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
  })

  it('transforms import.meta.filename', async t => {
    const result = await transform(join(fixtures, 'import.meta.filename.mjs'), {
      target: 'commonjs',
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

  it('transforms import.meta.dirname', async t => {
    const result = await transform(join(fixtures, 'import.meta.dirname.mjs'), {
      target: 'commonjs',
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

  it('wraps top-level await when targeting commonjs (wrap)', async t => {
    const fixturePath = join(fixtures, 'topLevelAwait.mjs')
    const result = await transform(fixturePath, {
      target: 'commonjs',
      topLevelAwait: 'wrap',
    })
    const outFile = join(fixtures, 'topLevelAwait.wrap.cjs')
    const requireCjs = createRequire(import.meta.url)

    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)
    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
    const mod = requireCjs(outFile)

    assert.equal(typeof mod.__tla?.then, 'function')
    await mod.__tla
    assert.equal(mod.value, 5)
    assert.equal(mod.default, 3)
  })

  it('preserves exports when top-level await targeting commonjs (preserve)', async t => {
    const fixturePath = join(fixtures, 'topLevelAwait.mjs')
    const result = await transform(fixturePath, {
      target: 'commonjs',
      topLevelAwait: 'preserve',
    })
    const outFile = join(fixtures, 'topLevelAwait.preserve.cjs')
    const requireCjs = createRequire(import.meta.url)

    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)
    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
    const mod = requireCjs(outFile)

    await delay(10)
    assert.equal(mod.value, 5)
    assert.equal(mod.default, 3)
  })

  it('transforms import.meta.resolve', async t => {
    const result = await transform(join(fixtures, 'import.meta.resolve.mjs'), {
      target: 'commonjs',
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

  it('gates import.meta.main shimming when requested', async t => {
    const fixturePath = join(fixtures, 'import.meta.main.mjs')
    const outFile = join(fixtures, 'import.meta.main.cjs')
    const result = await transform(fixturePath, {
      target: 'commonjs',
      importMetaMain: 'warn',
    })

    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    assert.ok(result.includes('import.meta.main is not supported before Node 22.18/24.2'))
    assert.ok(result.includes('process.versions.node'))
  })

  it('transforms es module globals to commonjs globals', async t => {
    const fixturePath = join(fixtures, 'file.mjs')
    const result = await transform(fixturePath, { target: 'commonjs' })
    const outFile = join(fixtures, 'file.out.cjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)
    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    assert.equal(result.indexOf('import.meta.url'), -1)
    assert.equal(result.indexOf('import.meta.filename'), -1)
    assert.equal(result.indexOf('import.meta.dirname'), -1)
    assert.equal(result.indexOf('import.meta.resolve'), -1)
    assert.ok(result.indexOf('require("node:url").pathToFileURL(__filename).href') > -1)
    assert.ok(result.indexOf('__dirname') > -1)
    assert.ok(result.indexOf('__filename') > -1)
    assert.ok(result.indexOf('require.resolve(') > -1)
    // Check `import.meta` transformed into `module`
    assert.equal(/import\.meta\s/.test(result), false)
    assert.ok(/\smodule\s/.test(result))
  })

  it('transforms commonjs globals to es module globals', async () => {
    const result = await transform(join(fixtures, 'file.cjs'), { target: 'module' })
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
    assert.ok(/import\.meta/.test(result))
    assert.ok(result.indexOf('{}') > -1)
  })

  it('updates specifiers when option enabled', async t => {
    const specifierRoot = join(fixtures, 'specifier')
    const fixturePath = join(specifierRoot, 'specifier.mjs')
    const result = await transform(fixturePath, {
      target: 'commonjs',
      rewriteSpecifier: '.js',
    })
    const outFile = join(specifierRoot, 'specifier.out.cjs')
    const cjsResult = await transform(join(specifierRoot, 'specifier.cjs'), {
      target: 'module',
      rewriteSpecifier: '.mjs',
    })

    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)
    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    assert.equal((result.match(/\.\/file\.js/g) ?? []).length, 6)
    assert.equal((result.match(/require\.resolve\('\.\/file\.js'\)/g) ?? []).length, 2)
    assert.equal((cjsResult.match(/\.\/file\.mjs/g) ?? []).length, 3)
    assert.equal(
      (cjsResult.match(/import\.meta\.resolve\('\.\/file\.mjs'\)/g) ?? []).length,
      1,
    )
  })

  it('writes transformed source to a file when option enabled', async t => {
    const mjs = join(fixtures, 'transformed.mjs')
    const cjs = join(fixtures, 'transformed.cjs')

    t.after(() => {
      rm(mjs, { force: true })
      rm(cjs, { force: true })
    })

    await transform(join(fixtures, 'file.mjs'), { target: 'commonjs', out: cjs })
    await transform(join(fixtures, 'file.cjs'), { target: 'module', out: mjs })

    assert.equal(await isValidFilename(mjs), true)
    assert.equal(await isValidFilename(cjs), true)

    const { status: statusCjs } = spawnSync('node', [cjs], { stdio: 'inherit' })
    assert.equal(statusCjs, 0)

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
