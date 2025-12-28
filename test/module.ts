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
    assert.ok(result.indexOf(')(import.meta.filename)') > -1)
    assert.ok(result.indexOf('import.meta.filename === process.argv[1]') > -1)
    assert.ok(result.indexOf('baz.apply(null, [import.meta.filename, a])') > -1)

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

  it('rewrites multi-declarator static require to imports when lowering to esm', async t => {
    const fixturePath = join(fixtures, 'requireMulti.cjs')
    const outFile = join(fixtures, 'requireMulti.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    assert.ok(result.includes("import * as __cjsImport0 from './values.cjs'"))
    assert.ok(result.includes('const a = __requireDefault(__cjsImport0);'))
    assert.ok(
      result.includes('const { foo, commonjs } = __requireDefault(__cjsImport1);'),
    )
    assert.equal(/require\(['"]\.\/values\.cjs['"]\)/.test(result), false)

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).foo, 'bar')
    assert.equal((mod as any).commonjs, true)
    assert.equal((mod as any).a.cjs, 'commonjs')
  })

  it('supports module.require while lowering to esm', async t => {
    const fixturePath = join(fixtures, 'moduleRequire.cjs')
    const outFile = join(fixtures, 'moduleRequire.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    assert.ok(result.includes("import * as __cjsImport0 from './values.cjs'"))
    assert.ok(result.includes('const mod = __requireDefault(__cjsImport0);'))
    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).default.foo, 'bar')
    assert.equal((mod as any).default.commonjs, true)
  })

  it('throws when encountering with/eval while lowering to esm', async () => {
    const fixturePath = join(fixtures, 'withEval.cjs')

    await assert.rejects(
      () => transform(fixturePath, { target: 'module' }),
      /with statements are not supported|eval is not supported/i,
    )
  })

  it('throws on eval when raising to esm', async () => {
    const fixturePath = join(fixtures, 'evalOnly.cjs')

    await assert.rejects(
      () => transform(fixturePath, { target: 'module' }),
      /eval is not supported/i,
    )
  })

  it('keeps nested requires via createRequire when lowering to esm', async t => {
    const fixturePath = join(fixtures, 'nestedRequire.cjs')
    const outFile = join(fixtures, 'nestedRequire.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    assert.ok(result.indexOf('createRequire') > -1)
    assert.ok(result.indexOf('const require = createRequire(import.meta.url);') > -1)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).default.foo, 'bar')
    assert.equal((mod as any).default.commonjs, true)
  })

  it('preserves outer exports when inner scopes shadow exports', async t => {
    const fixturePath = join(fixtures, 'nestedShadowExports.cjs')
    const outFile = join(fixtures, 'nestedShadowExports.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).default.foo, 'outer')
    assert.equal(typeof (mod as any).default.run, 'function')
    assert.equal((mod as any).default.run(), 'inner')
  })

  it('keeps block-scoped require via createRequire when lowering to esm', async t => {
    const fixturePath = join(fixtures, 'blockRequire.cjs')
    const outFile = join(fixtures, 'blockRequire.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    assert.ok(result.indexOf('createRequire') > -1)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).default.foo, 'bar')
    assert.equal((mod as any).default.commonjs, true)
  })

  it('handles module.exports alias chains when lowering to esm', async t => {
    const fixturePath = join(fixtures, 'aliasModuleExports.cjs')
    const outFile = join(fixtures, 'aliasModuleExports.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).foo, 1)
    assert.equal((mod as any).bar, 2)
    assert.equal((mod as any).baz, 3)
  })

  it('preserves runtime mutations on the exports bag default', async t => {
    const fixturePath = join(fixtures, 'liveBindingMutation.cjs')
    const outFile = join(fixtures, 'liveBindingMutation.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).counter, 1)
    ;(mod as any).inc()
    assert.equal(typeof (mod as any).inc, 'function')
  })

  it('exports computed property names when lowering to esm', async t => {
    const fixturePath = join(fixtures, 'computedReexport.cjs')
    const outFile = join(fixtures, 'computedReexport.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).default.fooBar, 'fb')
    assert.equal((mod as any).default.zap, 2)
    assert.equal((mod as any).default.bag['foo-bar'], 'fb')
  })

  it('exports non-identifier keys when raising to esm', async t => {
    const fixturePath = join(fixtures, 'weirdExport.cjs')
    const outFile = join(fixtures, 'weirdExport.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    assert.ok(result.includes('__export_foo_bar'))
    assert.ok(result.includes('__export_baz_qux'))
    assert.ok(result.includes('__export__123num'))

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any)['foo-bar'], 1)
    assert.equal((mod as any)['baz+qux'], 2)
    assert.equal((mod as any)['123num'], 3)
  })

  it('rewrites require.main to import.meta.main', async t => {
    const fixturePath = join(fixtures, 'requireMain.cjs')
    const outFile = join(fixtures, 'requireMain.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    assert.ok(result.indexOf('import.meta.main') > -1)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).default.main, false)
  })

  it('rewrites module === require.main to import.meta.main', async t => {
    const fixturePath = join(fixtures, 'requireMainReversed.cjs')
    const outFile = join(fixtures, 'requireMainReversed.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    assert.ok(result.includes('import.meta.main'))

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).default.main, false)
  })

  it('rewrites require.main inequality to negated import.meta.main', async t => {
    const fixturePath = join(fixtures, 'requireMainNotEq.cjs')
    const outFile = join(fixtures, 'requireMainNotEq.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    assert.ok(result.includes('!(import.meta.main)'))

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).default.main, false)
  })

  it('supports require.main realpath strategy', async t => {
    const fixturePath = join(fixtures, 'requireMain.cjs')
    const outFile = join(fixtures, 'requireMain.realpath.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, {
      target: 'module',
      requireMainStrategy: 'realpath',
    })
    await writeFile(outFile, result)

    assert.ok(
      result.includes(
        'import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href',
      ),
    )

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
  })

  it('detects circular requires when enabled', async () => {
    const fixturePath = join(fixtures, 'cycles', 'a.cjs')

    await assert.rejects(
      () =>
        transform(fixturePath, {
          target: 'module',
          detectCircularRequires: 'error',
        }),
      /Circular require detected/,
    )
  })

  it('warns on circular requires when warnings are enabled', async t => {
    const fixturePath = join(fixtures, 'cycles', 'a.cjs')
    const warnings: string[] = []
    /* eslint-disable no-console -- capture warn output for cycle detection */
    const originalWarn = console.warn

    t.after(() => {
      console.warn = originalWarn
    })

    console.warn = (...args: any[]) => {
      warnings.push(args.join(' '))
    }
    /* eslint-enable no-console */

    await transform(fixturePath, {
      target: 'module',
      detectCircularRequires: 'warn',
    })

    assert.ok(warnings.some(msg => msg.includes('Circular require detected')))
  })

  it('lifts exports inside control flow when lowering to esm', async t => {
    const fixturePath = join(fixtures, 'exportsControlFlow.cjs')
    const outFile = join(fixtures, 'exportsControlFlow.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).flag, 'ok')
  })

  it('rewrites static require to imports when lowering to esm', async t => {
    const fixturePath = join(fixtures, 'requireStatic.cjs')
    const outFile = join(fixtures, 'requireStatic.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    assert.ok(result.includes("import * as __cjsImport0 from './values.cjs'"))
    assert.ok(result.includes('const mod = __requireDefault(__cjsImport0);'))
    assert.equal(/require\(['"]\.\/values\.cjs['"]\)/.test(result), false)

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).default.foo, 'bar')
    assert.equal((mod as any).default.renamed, true)
    assert.equal((mod as any).default.cjs, 'commonjs')
  })

  it('keeps dynamic require via createRequire when lowering to esm', async t => {
    const fixturePath = join(fixtures, 'requireDynamic.cjs')
    const outFile = join(fixtures, 'requireDynamic.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    assert.ok(result.indexOf('createRequire') > -1)
    assert.ok(result.indexOf('const require = createRequire(import.meta.url);') > -1)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).default.foo, 'bar')
    assert.equal((mod as any).default.commonjs, true)
  })

  it('uses dynamic import for async nested require when strategy enabled', async t => {
    const fixturePath = join(fixtures, 'requireAsync.cjs')
    const outFile = join(fixtures, 'requireAsync.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, {
      target: 'module',
      nestedRequireStrategy: 'dynamic-import',
    })

    await writeFile(outFile, result)

    assert.equal(/\(await import\(['"]\.\/values\.cjs['"]\)\)/.test(result), true)
    assert.equal(result.includes('createRequire'), false)

    const mod = await import(pathToFileURL(outFile).href)
    const exported = (mod as any).default ?? (mod as any)
    const res = await exported.load()

    assert.equal(res.foo, 'bar')
    assert.equal(res.commonjs, true)
  })

  it('falls back to createRequire for sync nested require when strategy is dynamic-import', async t => {
    const fixturePath = join(fixtures, 'requireSync.cjs')
    const outFile = join(fixtures, 'requireSync.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, {
      target: 'module',
      nestedRequireStrategy: 'dynamic-import',
    })

    await writeFile(outFile, result)

    assert.ok(result.includes('createRequire'))
    assert.equal(/require\(['"]\.\/values\.cjs['"]\)/.test(result), true)

    const mod = await import(pathToFileURL(outFile).href)
    const exported = (mod as any).default ?? (mod as any)
    const res = exported.loadSync()

    assert.equal(res.foo, 'bar')
    assert.equal(res.commonjs, true)
  })

  it('uses createRequire for non-hoistable static require patterns when raising to esm', async () => {
    const fixturePath = join(fixtures, 'requireArray.cjs')

    const result = await transform(fixturePath, { target: 'module' })

    assert.ok(result.includes('createRequire'))
    assert.equal(result.includes('__requireArrayFirst'), true)
  })

  it('throws when module or exports is shadowed in cjs to esm lowering', async () => {
    const fixturePath = join(fixtures, 'shadowedExports.cjs')

    await assert.rejects(
      () => transform(fixturePath, { target: 'module' }),
      /shadowed in module scope/i,
    )
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

  it('lowers side-effect import when targeting commonjs', async t => {
    const { exportsObj, result } = await transformEsmToCjs(t, 'importSideEffect.mjs')

    assert.equal((exportsObj as any).loaded, true)
    assert.ok(result.includes("require('./values.cjs');"))
  })

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

  it('exports named function and class when lowering to commonjs', async t => {
    const { exportsObj } = await transformEsmToCjs(t, 'exportNamedFunction.mjs')

    assert.equal(exportsObj.greet(), 'greet')
    const box = new (exportsObj as any).Box()
    assert.equal(box.value, 1)
  })

  it('exports named default function without top-level await when lowering to commonjs', async t => {
    const { exportsObj } = await transformEsmToCjs(t, 'exportDefaultNamed.mjs')

    assert.equal(typeof exportsObj, 'function')
    assert.equal((exportsObj as any)(), 'named-no-tla')
  })

  it('handles default re-export with interop when lowering to commonjs', async t => {
    const { exportsObj, result } = await transformEsmToCjs(t, 'exportReexportDefault.mjs')

    assert.equal(exportsObj.anon(), 'anon')
    assert.equal(exportsObj.named(), 'named-no-tla')
    assert.equal(exportsObj.label, 'reexport')
    assert.ok(result.includes('__interopDefault'))
  })

  it('handles export namespace specifier when lowering to commonjs', async t => {
    const { exportsObj } = await transformEsmToCjs(t, 'exportNamespaceSpecifier.mjs')

    assert.equal(typeof exportsObj.ns.default, 'function')
    assert.equal(exportsObj.ns.default(), 'anon')
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

  it('transforms commonjs globals to es module globals', async t => {
    const outFile = join(fixtures, 'file.globals.mjs')
    const result = await transform(join(fixtures, 'file.cjs'), { target: 'module' })

    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)
    assert.equal(result.indexOf('__filename'), -1)
    assert.equal(result.indexOf('__dirname'), -1)
    assert.ok(result.includes('__requireResolve'))
    assert.ok(result.indexOf('import.meta.filename') > -1)
    assert.ok(result.indexOf('import.meta.dirname') > -1)
    assert.equal(/import\.meta\.resolve/.test(result), false)
    // Check `module`, `exports` and `require.cache`
    assert.equal(!/\smodule\s/.test(result), true)
    assert.equal(!/\sexports\s/.test(result), true)
    assert.equal(result.indexOf('require.cache'), -1)
    assert.ok(/import\.meta/.test(result))
    assert.ok(result.indexOf('{}') > -1)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
  })

  it('rewrites require.resolve to scoped helper when raising to esm', async t => {
    const result = await transform(join(fixtures, 'file.cjs'), { target: 'module' })
    const outFile = join(fixtures, 'file.resolve.mjs')

    await rm(outFile, { force: true })
    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)

    const requireCjs = createRequire(outFile)
    const mod = await import(pathToFileURL(outFile).href)
    const exported = (mod as any).default ?? (mod as any)

    assert.ok(result.includes('createRequire'))
    assert.ok(result.includes('__requireResolve'))
    assert.equal(/require\.resolve\(\.\/values\.cjs\)/.test(result), false)
    assert.equal(/import\.meta\.resolve/.test(result), false)
    assert.equal((exported as any).resolved, requireCjs.resolve('./values.cjs'))
  })

  it('raises json require to import with attributes', async t => {
    const fixturePath = join(fixtures, 'requireJson.cjs')
    const outFile = join(fixtures, 'requireJson.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    assert.ok(result.includes('with { type: "json" }'))
    assert.equal(/require\(['"]\.\/data.json['"]\)/.test(result), false)

    const mod = await import(pathToFileURL(outFile).href)
    const exported = (mod as any).default ?? (mod as any)
    assert.equal(exported.value, 'alpha')
    assert.deepEqual(exported.pick, { value: 'alpha', nested: { n: 1 } })
    assert.equal(exported.side, 'ok')
  })

  it('rewrites top-level this to exports when raising to esm', async t => {
    const fixturePath = join(fixtures, 'topLevelThis.cjs')
    const outFile = join(fixtures, 'topLevelThis.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    assert.equal(/\bthis\b/.test(result), false)

    const mod = await import(pathToFileURL(outFile).href)
    const exported =
      (mod as any).default ?? (mod as any).self ?? (mod as any).default ?? (mod as any)

    assert.equal(exported.alpha, 1)
    assert.equal(exported.beta, 2)
    assert.equal(exported.self, exported)
    assert.equal(exported.check(), true)
    assert.equal((mod as any).self, exported)
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
      (cjsResult.match(/__requireResolve\('\.\/file\.mjs'\)/g) ?? []).length,
      1,
    )
    assert.equal(
      (cjsResult.match(/import\.meta\.resolve\('\.\/file\.mjs'\)/g) ?? []).length,
      0,
    )
  })

  it('appends .js to relative specifiers when targeting module', async t => {
    const specifierRoot = join(fixtures, 'specifier')
    const fixturePath = join(specifierRoot, 'noext.cjs')
    const result = await transform(fixturePath, { target: 'module' })
    const outFile = join(specifierRoot, 'noext.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)
    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    assert.equal((result.match(/\.\/file\.js/g) ?? []).length, 3)
    assert.equal(result.includes("'./file'"), false)
  })

  it('appends index.js for directory specifiers when targeting module', async t => {
    const specifierRoot = join(fixtures, 'specifier')
    const fixturePath = join(specifierRoot, 'dirImport.cjs')
    const result = await transform(fixturePath, { target: 'module' })
    const outFile = join(specifierRoot, 'dirImport.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    await writeFile(outFile, result)
    const mod = await import(pathToFileURL(outFile).href)

    assert.ok(result.includes('./dir/index.js'))
    assert.equal((mod as any).value, 42)
  })

  it('skips directory index append when disabled', async () => {
    const fixturePath = join(fixtures, 'edgecases', 'dirTrailing.cjs')

    const result = await transform(fixturePath, {
      target: 'module',
      appendDirectoryIndex: false,
    })

    assert.ok(result.includes('./dir/'))
    assert.equal(result.includes('./dir/index.js'), false)
  })

  it('emits idiomatic exports in safe CJS files', async t => {
    const fixturePath = join(fixtures, 'idiomaticSafe.cjs')
    const outFile = join(fixtures, 'idiomaticSafe.mjs')

    t.after(() => rm(outFile, { force: true }))

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    assert.equal(result.includes('__exports'), false)
    assert.ok(/export const foo\s*=\s*1/.test(result))
    assert.ok(result.includes('export const bar'))

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).foo, 1)
    assert.equal(typeof (mod as any).bar, 'function')
    assert.equal((mod as any).bar(), 'bar')
  })

  it('respects idiomaticExports: off and keeps helper bag', async t => {
    const fixturePath = join(fixtures, 'idiomaticSafe.cjs')
    const outFile = join(fixtures, 'idiomaticOff.mjs')

    t.after(() => rm(outFile, { force: true }))

    const result = await transform(fixturePath, {
      target: 'module',
      idiomaticExports: 'off',
    })

    await writeFile(outFile, result)

    assert.ok(result.includes('__exports'))

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).foo, 1)
  })

  it('honors idiomaticExports: aggressive (currently same as safe)', async t => {
    const fixturePath = join(fixtures, 'idiomaticSafe.cjs')
    const outFile = join(fixtures, 'idiomaticAggressive.mjs')

    t.after(() => rm(outFile, { force: true }))

    const result = await transform(fixturePath, {
      target: 'module',
      idiomaticExports: 'aggressive',
    })

    await writeFile(outFile, result)

    assert.equal(result.includes('__exports'), false)
    assert.ok(/export const foo\s*=\s*1/.test(result))

    const mod = await import(pathToFileURL(outFile).href)
    assert.equal((mod as any).foo, 1)
  })

  it('falls back to helper exports when idiomatic is unsafe', async () => {
    const fixturePath = join(fixtures, 'idiomaticFallback.cjs')
    const diagnostics: Array<{ code: string }> = []

    const result = await transform(fixturePath, {
      target: 'module',
      diagnostics: diag => diagnostics.push(diag),
    })

    assert.ok(result.includes('__exports'))
    assert.ok(diagnostics.some(d => d.code === 'idiomatic-exports-fallback'))
  })

  it('emits diagnostics for CJS to ESM edge cases', async () => {
    const fixturePath = join(fixtures, 'diagnostics.cjs')
    const diagnostics: Array<{ code: string }> = []

    await transform(fixturePath, {
      target: 'module',
      diagnostics: diag => diagnostics.push(diag),
    })

    const codes = diagnostics.map(d => d.code).sort()

    assert.ok(codes.includes('cjs-mixed-exports'))
    assert.ok(codes.some(code => code.startsWith('cjs-export-reassignment:foo')))
    assert.ok(codes.includes('cjs-string-export:weird-name'))
    assert.ok(codes.includes('top-level-return'))
    assert.ok(codes.includes('legacy-require-cache'))
  })

  it('normalizes builtin specifiers to the node: protocol', async t => {
    const specifierRoot = join(fixtures, 'specifier')
    const fixturePath = join(specifierRoot, 'builtin.cjs')
    const outFile = join(specifierRoot, 'builtin.out.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    assert.ok(/node:fs\b/.test(result))
    assert.ok(/node:fs\/promises\b/.test(result))
    assert.equal((result.match(/from ['"]fs['"]/g) ?? []).length, 0)
    assert.equal((result.match(/require\(['"]fs['"]\)/g) ?? []).length, 0)
    assert.equal((result.match(/node:node:/g) ?? []).length, 0)

    const mod = await import(pathToFileURL(outFile).href)
    const exported = (mod as any).default ?? (mod as any)
    assert.equal(exported.summary.fs, 'function')
    assert.equal(exported.summary.fsp, 'function')
    assert.equal(exported.summary.assert, 'function')
  })

  it('exports anonymous default function when lowering to commonjs', async () => {
    const fixturePath = join(fixtures, 'exportDefaultAnon.mjs')
    const result = await transform(fixturePath, { target: 'commonjs' })
    const outFile = join(fixtures, 'exportDefaultAnon.cjs')
    const requireCjs = createRequire(import.meta.url)

    try {
      await writeFile(outFile, result)
      const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
      assert.equal(status, 0)
      const mod = requireCjs(outFile)
      assert.equal(typeof mod, 'function')
      assert.equal(mod(), 'anon')
    } finally {
      await rm(outFile, { force: true })
    }
  })

  it('handles export namespace all when lowering to commonjs', async () => {
    const fixturePath = join(fixtures, 'exportNamespaceAll.mjs')
    const result = await transform(fixturePath, { target: 'commonjs' })
    const outFile = join(fixtures, 'exportNamespaceAll.cjs')
    const requireCjs = createRequire(import.meta.url)

    try {
      await writeFile(outFile, result)
      const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
      assert.equal(status, 0)
      const mod = requireCjs(outFile)
      assert.equal(mod.bag.esmodule, true)
      assert.equal(mod.bag.foo, 'bar')
      assert.equal(typeof mod.bag.obj, 'object')
    } finally {
      await rm(outFile, { force: true })
    }
  })

  it('respects cjsDefault option when lowering default import', async t => {
    const fixturePath = join(fixtures, 'esmDefault.mjs')
    const outFile = join(fixtures, 'esmDefault.cjs')
    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, {
      target: 'commonjs',
      cjsDefault: 'none',
    })
    await writeFile(outFile, result)
    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
    const requireCjs = createRequire(import.meta.url)
    const mod = requireCjs(outFile)
    assert.equal(mod, 'default-val')
  })

  it('honors cjsDefault module-exports when lowering to commonjs', async t => {
    const fixturePath = join(fixtures, 'cjsDefaultModuleExports.mjs')
    const outFile = join(fixtures, 'cjsDefaultModuleExports.cjs')
    const requireCjs = createRequire(import.meta.url)

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, {
      target: 'commonjs',
      cjsDefault: 'module-exports',
    })
    await writeFile(outFile, result)
    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)
    const mod = requireCjs(outFile)
    assert.equal(mod.value, 'bar')
    assert.equal(result.includes('__interopDefault'), false)
  })

  it('respects liveBindings off when lowering to commonjs', async t => {
    const fixturePath = join(fixtures, 'liveBindingsOff.mjs')
    const outFile = join(fixtures, 'liveBindingsOff.cjs')
    const requireCjs = createRequire(import.meta.url)

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, {
      target: 'commonjs',
      liveBindings: 'off',
    })
    await writeFile(outFile, result)
    assert.ok(result.includes('exports.foo = foo;'))
    assert.ok(result.includes('exports.inc = inc;'))

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    const mod = requireCjs(outFile)
    assert.equal(mod.foo, 1)
    assert.equal(mod.inc(2), 3)
  })

  it('throws on top-level await when targeting commonjs with error policy', async () => {
    const fixturePath = join(fixtures, 'tlaError.mjs')
    await assert.rejects(
      () => transform(fixturePath, { target: 'commonjs', topLevelAwait: 'error' }),
      /Top-level await is not supported/i,
    )
  })

  it('wraps default function export when TLA present', async () => {
    const fixturePath = join(fixtures, 'exportDefaultTlaNamed.mjs')
    const result = await transform(fixturePath, {
      target: 'commonjs',
      topLevelAwait: 'wrap',
    })
    const outFile = join(fixtures, 'exportDefaultTlaNamed.cjs')
    const requireCjs = createRequire(import.meta.url)

    try {
      await writeFile(outFile, result)
      const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
      assert.equal(status, 0)
      const mod = requireCjs(outFile)
      assert.equal(typeof mod.__tla?.then, 'function')
      await mod.__tla
      assert.equal(mod.default(), 'tla-named')
    } finally {
      await rm(outFile, { force: true })
    }
  })

  it('wraps anonymous default export when TLA present', async () => {
    const fixturePath = join(fixtures, 'exportDefaultAnonTla.mjs')
    const result = await transform(fixturePath, {
      target: 'commonjs',
      topLevelAwait: 'wrap',
    })
    const outFile = join(fixtures, 'exportDefaultAnonTla.cjs')
    const requireCjs = createRequire(import.meta.url)

    try {
      await writeFile(outFile, result)
      const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
      assert.equal(status, 0)
      const mod = requireCjs(outFile)
      assert.equal(typeof mod.__tla?.then, 'function')
      await mod.__tla
      assert.equal(mod.default(), 'tla-anon')
    } finally {
      await rm(outFile, { force: true })
    }
  })

  it('strips bare module.exports expression when raising to esm', async () => {
    const fixturePath = join(fixtures, 'bareModuleExports.cjs')
    const result = await transform(fixturePath, { target: 'module' })
    assert.equal(result.includes('module.exports;'), false)
    const outFile = join(fixtures, 'bareModuleExports.mjs')

    try {
      await writeFile(outFile, result)
      const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
      assert.equal(status, 0)
      const mod = await import(pathToFileURL(outFile).href)
      assert.equal((mod as any).foo, 1)
    } finally {
      await rm(outFile, { force: true })
    }
  })

  it('globals-only rewrites esm globals without touching exports', async t => {
    const fixturePath = join(fixtures, 'globalsOnly.mjs')
    const outFile = join(fixtures, 'globalsOnly.out.mjs')

    t.after(() => rm(outFile, { force: true }))

    const result = await transform(fixturePath, {
      target: 'module',
      transformSyntax: 'globals-only',
      out: outFile,
    })

    assert.ok(result.includes('import.meta.dirname'))
    assert.ok(result.includes('import.meta.filename'))
    assert.ok(result.includes('export const here'))
    assert.equal(result.includes('__exports'), false)

    const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
    assert.equal(status, 0)

    const mod = await import(pathToFileURL(outFile).href)
    assert.ok(String(mod.here).includes('fixtures'))
    assert.ok(String(mod.file).includes('globalsOnly.out.mjs'))
    assert.ok(String(mod.url).includes('globalsOnly.out.mjs'))
  })

  it('globals-only rewrites cjs globals without changing export shape', async () => {
    const fixturePath = join(fixtures, 'globalsOnly.cjs')
    const outFile = join(fixtures, 'globalsOnly.out.cjs')
    const requireCjs = createRequire(import.meta.url)

    try {
      const result = await transform(fixturePath, {
        target: 'commonjs',
        transformSyntax: 'globals-only',
        out: outFile,
      })

      assert.ok(result.includes('__dirname'))
      assert.ok(result.includes('__filename'))
      assert.ok(result.includes('module.exports'))
      assert.equal(result.includes('__exports'), false)

      const { status } = spawnSync('node', [outFile], { stdio: 'inherit' })
      assert.equal(status, 0)

      const base = requireCjs(fixturePath)
      const out = requireCjs(outFile)
      assert.equal(out.here, base.here)
      assert.equal(out.resolved, base.resolved)
      assert.equal(out.file, outFile)
    } finally {
      await rm(outFile, { force: true })
    }
  })

  it('converts a small commonjs project to esm', async t => {
    const projectRoot = join(fixtures, 'projects', 'cjs-app')
    const entry = join(projectRoot, 'index.cjs')
    const lib = join(projectRoot, 'lib.cjs')
    const outEntry = join(projectRoot, 'index.mjs')
    const outLib = join(projectRoot, 'lib.mjs')

    t.after(() => {
      rm(outEntry, { force: true })
      rm(outLib, { force: true })
    })

    const [entryResult, libResult] = await Promise.all([
      transform(entry, {
        target: 'module',
        rewriteSpecifier: '.mjs',
      }),
      transform(lib, {
        target: 'module',
        rewriteSpecifier: '.mjs',
      }),
    ])

    await Promise.all([writeFile(outEntry, entryResult), writeFile(outLib, libResult)])

    const { status } = spawnSync('node', [outEntry], { stdio: 'inherit' })
    assert.equal(status, 0)

    const mod = await import(pathToFileURL(outEntry).href)
    const result = (mod as any).main()
    assert.equal(result.bumped, 3)
    assert.equal(result.value, 1)

    // Dynamic require path should still work under createRequire fallback
    const libMod = await import(pathToFileURL(outLib).href)
    assert.equal(libMod.dynamicLoad('./lib.mjs'), 1)
  })

  it('converts a small esm project to commonjs with top-level await wrapping', async t => {
    const projectRoot = join(fixtures, 'projects', 'esm-app')
    const entry = join(projectRoot, 'index.mjs')
    const lib = join(projectRoot, 'lib.mjs')
    const outEntry = join(projectRoot, 'index.cjs')
    const outLib = join(projectRoot, 'lib.cjs')
    const requireCjs = createRequire(import.meta.url)

    t.after(() => {
      rm(outEntry, { force: true })
      rm(outLib, { force: true })
    })

    const [entryResult, libResult] = await Promise.all([
      transform(entry, {
        target: 'commonjs',
        rewriteSpecifier: '.cjs',
        topLevelAwait: 'wrap',
        importMetaMain: 'warn',
      }),
      transform(lib, { target: 'commonjs', rewriteSpecifier: '.cjs' }),
    ])

    await Promise.all([writeFile(outEntry, entryResult), writeFile(outLib, libResult)])

    const { status } = spawnSync('node', [outEntry], { stdio: 'inherit' })
    assert.equal(status, 0)

    const mod = requireCjs(outEntry)
    assert.equal(typeof mod.__tla?.then, 'function')
    await mod.__tla
    const result = await mod.run()
    assert.equal(result.sum, 2)
    assert.ok(result.after >= 1)

    // importMetaMain warn should be embedded in generated code
    assert.ok(entryResult.includes('import.meta.main is not supported'))
  })

  it('roundtrips complex fixtures across targets', async t => {
    const cjsFixture = join(fixtures, 'complexFile.cjs')
    const esmFixture = join(fixtures, 'complexFile.mjs')
    const outEsm = join(fixtures, 'complexFile.out.mjs')
    const outCjs = join(fixtures, 'complexFile.out.cjs')
    const outEsmUrl = pathToFileURL(outEsm).href
    const outCjsUrl = pathToFileURL(outCjs).href
    const requireCjs = createRequire(import.meta.url)

    t.after(() => {
      rm(outEsm, { force: true })
      rm(outCjs, { force: true })
    })

    const [baseCjs, baseEsm] = await Promise.all([
      Promise.resolve(requireCjs(cjsFixture)),
      import(pathToFileURL(esmFixture).href),
    ])

    const [cjsToEsm, esmToCjs] = await Promise.all([
      transform(cjsFixture, { target: 'module' }),
      transform(esmFixture, { target: 'commonjs' }),
    ])

    await Promise.all([writeFile(outEsm, cjsToEsm), writeFile(outCjs, esmToCjs)])

    const { status: statusEsm } = spawnSync('node', [outEsm], { stdio: 'inherit' })
    const { status: statusCjs } = spawnSync('node', [outCjs], { stdio: 'inherit' })

    assert.equal(statusEsm, 0)
    assert.equal(statusCjs, 0)

    const unwrap = (mod: any) => mod.default ?? mod
    const expectedCjs = unwrap(baseCjs)
    const expectedEsm = unwrap(baseEsm)
    const cjs = unwrap(await import(pathToFileURL(outEsm).href))
    const esm = unwrap(requireCjs(outCjs))

    assert.equal(cjs.base, 'cjs')
    assert.equal(cjs.extra, expectedCjs.extra)
    assert.equal(cjs.aliased, 'ok')
    assert.equal(cjs['weird-key'], 'strange')
    assert.ok(String(cjs.resolved).includes('values.cjs'))
    assert.equal(String(cjs.url), outEsmUrl)
    assert.equal(cjs.dirname, expectedCjs.dirname)
    assert.equal(cjs.filename, outEsm)
    assert.equal(cjs.dynamic.foo, 'bar')
    assert.ok(cjs.file)
    assert.equal(typeof cjs.load, 'function')
    assert.equal(cjs.load('values.cjs').foo, 'bar')
    const cjsStart = cjs.counter
    assert.equal(cjs.bump(), cjsStart + 1)

    assert.equal(esm.base, 'esm')
    assert.equal(esm.extra, 'kept')
    assert.equal(esm.aliased, 'ok')
    assert.equal(esm.aliasTarget.esmodule, true)
    assert.equal(esm.fromReexport, 'from-reexport')
    assert.equal(esm.fromValues, 'bar')
    assert.equal(esm.computedKey, 'weird-key')
    assert.equal(esm.computedValue, 'strange')
    assert.ok(String(esm.resolved).includes('values.mjs'))
    assert.equal(String(esm.url), outCjsUrl)
    assert.equal(esm.dirname, expectedEsm.dirname)
    assert.equal(esm.filename, expectedEsm.filename)
    assert.ok(esm.file)
    const loaded = await esm.load('values.mjs')
    assert.equal((loaded as any).foo ?? (loaded as any).default?.foo, 'bar')
    const esmStart = esm.counter
    assert.equal(esm.bump(), esmStart + 1)
    assert.equal(esm.counter, esmStart + 1)
  })

  it('handles shadowed params for cjs globals when raising to esm', async t => {
    const fixturePath = join(fixtures, 'edgecases', 'shadowedParams.cjs')
    const outFile = join(fixtures, 'edgecases', 'shadowedParams.out.mjs')

    t.after(() => {
      rm(outFile, { force: true })
    })

    const result = await transform(fixturePath, { target: 'module' })
    await writeFile(outFile, result)

    const mod = await import(pathToFileURL(outFile).href)
    const exported = (mod as any).default ?? (mod as any)

    assert.equal(exported.topDir.endsWith('edgecases'), true)
    assert.equal(typeof exported.local.load, 'function')
  })

  it('warns and still runs mixed module.exports reassignments', async t => {
    const fixturePath = join(fixtures, 'edgecases', 'mixedReassign.cjs')
    const outFile = join(fixtures, 'edgecases', 'mixedReassign.out.mjs')

    t.after(() => rm(outFile, { force: true }))

    const diagnostics: Array<{ code: string }> = []
    const result = await transform(fixturePath, {
      target: 'module',
      diagnostics: diag => diagnostics.push(diag),
    })
    await writeFile(outFile, result)

    const mod = await import(pathToFileURL(outFile).href)
    const exported = (mod as any).default ?? (mod as any)

    assert.ok(diagnostics.some(d => d.code === 'cjs-mixed-exports'))
    assert.equal(exported.gamma, 3)
    assert.equal(exported.extra, true)
    assert.equal(exported.beta, undefined)
  })

  it('wraps TLA with mixed exports when lowering to commonjs', async t => {
    const fixturePath = join(fixtures, 'edgecases', 'tlaMixed.mjs')
    const outFile = join(fixtures, 'edgecases', 'tlaMixed.cjs')
    const requireCjs = createRequire(import.meta.url)

    t.after(() => rm(outFile, { force: true }))

    const result = await transform(fixturePath, {
      target: 'commonjs',
      topLevelAwait: 'wrap',
    })

    await writeFile(outFile, result)
    const mod = requireCjs(outFile)
    assert.equal(typeof mod.__tla?.then, 'function')
    await mod.__tla
    assert.equal(mod.counter, 1)
    assert.equal(mod.doubled, 2)
    assert.equal(typeof mod.default, 'function')
    assert.equal(mod.default(), 1)
    assert.equal(mod.inc(), 2)
  })

  it('guards import.meta.main shim behavior when lowering to commonjs', async t => {
    const fixturePath = join(fixtures, 'edgecases', 'importMetaMainGuard.mjs')
    const outFile = join(fixtures, 'edgecases', 'importMetaMainGuard.cjs')
    const requireCjs = createRequire(import.meta.url)

    t.after(() => rm(outFile, { force: true }))

    const result = await transform(fixturePath, {
      target: 'commonjs',
      importMetaMain: 'warn',
    })
    await writeFile(outFile, result)

    const mod = requireCjs(outFile)
    assert.equal(mod.mainFlag, 'not-main')
    assert.equal(mod.run(), 'lib-run')
    assert.ok(result.includes('import.meta.main is not supported'))
  })

  it('preserves dirname alias export when lowering to commonjs', async t => {
    const fixturePath = join(fixtures, 'edgecases', 'dirnameAlias.mjs')
    const outFile = join(fixtures, 'edgecases', 'dirnameAlias.cjs')
    const requireCjs = createRequire(import.meta.url)

    t.after(() => rm(outFile, { force: true }))

    const result = await transform(fixturePath, { target: 'commonjs' })
    await writeFile(outFile, result)

    const mod = requireCjs(outFile)
    assert.equal(mod.dirnameAlias, join(fixtures, 'edgecases'))
    assert.ok(result.includes('__dirname'))
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
    const { status: statusEsm } = spawnSync('node', [mjs], { stdio: 'inherit' })
    assert.equal(statusEsm, 0)
  })
})
