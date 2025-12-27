import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'

import { specifier } from '../src/specifier.js'

const fixtures = resolve(import.meta.dirname, 'fixtures', 'specifier')

const rewriteRelative = (value: string, suffix: string) => {
  // Collapse BinaryExpression or NewExpression text to detect relative ids
  const collapsed = value.replace(/['"`+)\s]|new String\(/g, '')
  if (!/^(?:\.|\.\.)\//.test(collapsed)) return
  return value.replace(/\.([mc]?js|[mc]?ts)/g, `${suffix}.$1`)
}

describe('specifier.update', () => {
  it('rewrites imports, import.meta.resolve, and dynamic imports in esm files', async () => {
    const result = await specifier.update(
      join(fixtures, 'specifier.mjs'),
      ({ value }) => {
        return rewriteRelative(value, '.out')
      },
    )

    assert.ok(result.includes('./file.out.mts'))
    assert.ok(result.includes('./file.out.cts'))
    assert.ok(result.includes('./file.out.ts'))
    assert.ok(result.includes("import.meta.resolve('./file.out.cjs')"))
    assert.ok(result.includes("import.meta.resolve('./file.out.js')"))
    assert.ok(result.includes('./${foo}${bar}${baz}.out.cjs'))
    // non-relative should remain untouched
    assert.ok(result.includes("new String('not-relative.js')"))
  })

  it('rewrites require and import usage in cjs files', async () => {
    const result = await specifier.update(
      join(fixtures, 'specifier.cjs'),
      ({ value }) => {
        return rewriteRelative(value, '.esm')
      },
    )

    assert.ok(result.includes("require('./file.esm.cjs')"))
    assert.ok(result.includes("require.resolve('./file.esm.cjs')"))
    assert.ok(result.includes("import('./file.esm.cjs')"))
  })

  it('throws for missing files or directories', async () => {
    await assert.rejects(() => specifier.update(join(fixtures, 'missing.js'), () => {}), {
      message: /does not resolve to a file on disk/,
    })

    await assert.rejects(() => specifier.update(fixtures, () => {}), {
      message: /does not resolve to a file on disk/,
    })
  })
})

describe('specifier.updateSrc', () => {
  it('rewrites mixed expression shapes', async () => {
    const source =
      `
      import './side.js'
      import('./dynamic.js').then(() => {})
      import(` +
      '`' +
      `./tmpl/\${name}.js` +
      '`' +
      `)
      const bin = require('./binary' + '/expression.js')
      const newReq = require(new String('./new.js'))
      import(new String('./new-import.js'))
      const arrowImport = () => import('./arrow.js')
      const arrowRequire = () => require('./arrow-req.js')
    `

    const updated = await specifier.updateSrc(source, 'js', ({ value }) => {
      return rewriteRelative(value, '.mjs')
    })

    assert.ok(updated.includes("import './side.mjs.js'"))
    assert.ok(updated.includes("import('./dynamic.mjs.js').then"))
    assert.ok(updated.includes('import(`./tmpl/${name}.mjs.js`)'))
    assert.ok(updated.includes("require('./binary' + '/expression.mjs.js')"))
    assert.ok(updated.includes("require(new String('./new.mjs.js'))"))
    assert.ok(updated.includes("import(new String('./new-import.mjs.js'))"))
    assert.ok(updated.includes("() => import('./arrow.mjs.js')"))
    assert.ok(updated.includes("() => require('./arrow-req.mjs.js')"))
    assert.ok(!updated.includes('./new-import.js'))
    assert.ok(!updated.includes("'/expression.js'"))
  })

  it('rewrites TS import type literals', async () => {
    const tsSource = `
      type Foo = import('./types.js').Foo
      const value: import('./types.js').Bar = {}
    `

    const updated = await specifier.updateSrc(tsSource, 'ts', ({ value }) => {
      return rewriteRelative(value, '.mjs')
    })

    assert.equal([...updated.matchAll(/types\.mjs\.js/g)].length, 2)
  })

  it('rewrites import().then and export declarations', async () => {
    const source =
      `
      import('./dyn.js').then(() => {})
      import(` +
      '`' +
      `./tmpl/\${name}.js` +
      '`' +
      `)
      export { foo } from './exported.js'
      export * from './star.js'
    `

    const updated = await specifier.updateSrc(source, 'js', ({ value }) => {
      return rewriteRelative(value, '.esm')
    })

    assert.ok(updated.includes("import('./dyn.esm.js').then"))
    assert.ok(updated.includes('./tmpl/${name}.esm.js'))
    assert.ok(updated.includes("export { foo } from './exported.esm.js'"))
    assert.ok(updated.includes("export * from './star.esm.js'"))
  })

  it('rewrites jsx and tsx input', async () => {
    const jsxSource = "import './jsx.js'\nconst el = <div />"
    const tsxSource = "import './tsx.js'\nconst el: JSX.Element = <div />"

    const jsxUpdated = await specifier.updateSrc(jsxSource, 'jsx', ({ value }) => {
      return rewriteRelative(value, '.mjs')
    })
    const tsxUpdated = await specifier.updateSrc(tsxSource, 'tsx', ({ value }) => {
      return rewriteRelative(value, '.mjs')
    })

    assert.ok(jsxUpdated.includes("import './jsx.mjs.js'"))
    assert.ok(tsxUpdated.includes("import './tsx.mjs.js'"))
  })
})
