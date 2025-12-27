import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolve, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

import { parse } from '#parse'
import { collectModuleIdentifiers } from '#utils/identifiers.js'
import { collectCjsExports } from '#utils/exports.js'
import { getLangFromExt } from '#utils/lang.js'

// Use fixtures to more easily track character offsets and line numbers in test cases.
const fixtures = resolve(import.meta.dirname, 'fixtures')

describe('collectModuleIdentifiers', () => {
  it('collects identifiers declarations in top-level module scope', async () => {
    const fixturePath = join(fixtures, 'identifiers', 'declarations.js')
    const code = await readFile(fixturePath)
    const ast = parse('file.ts', code.toString())
    const idents = await collectModuleIdentifiers(ast.program)
    const keys = Array.from(idents.keys())
    const { status } = spawnSync('node', [fixturePath], { stdio: 'inherit' })

    // Test for valid syntax
    assert.equal(status, 0)

    assert.deepEqual(keys, [
      'a',
      'b',
      'c',
      'd',
      'foo',
      'bar',
      'theta',
      'iota',
      'f',
      'l',
      'p',
      's',
      't',
      'v',
    ])
    assert.equal(idents.get('c')!.read.length, 1)
    assert.equal(idents.get('b')!.read.length, 2)
    assert.equal(idents.get('a')!.read.length, 0)
  })

  it('records subsequent reads of collected identifiers', async () => {
    const fixturePath = join(fixtures, 'identifiers', 'reads.js')
    const code = await readFile(fixturePath)
    const ast = parse('file.ts', code.toString())
    const idents = await collectModuleIdentifiers(ast.program)
    const reads: number[] = []
    const { status } = spawnSync('node', [fixturePath], { stdio: 'inherit' })

    // Test for valid syntax
    assert.equal(status, 0)

    idents.get('a')!.read.forEach(read => {
      reads.push(read.start)
    })

    assert.equal(idents.get('a')!.read.length, 18)
    assert.deepEqual(
      reads,
      [
        33, 65, 149, 266, 465, 519, 576, 627, 725, 800, 855, 895, 1489, 1611, 1738, 1824,
        1889, 1926,
      ],
    )
  })

  it('correctly counts reads for hoisted function declarations', async () => {
    const fixturePath = join(
      fixtures,
      'identifiers',
      'hoisting',
      'functionDeclaration.js',
    )
    const code = await readFile(fixturePath)
    const ast = parse('file.ts', code.toString())
    const idents = await collectModuleIdentifiers(ast.program, true)
    const fooReads: number[] = []
    const barReads: number[] = []
    const { status } = spawnSync('node', [fixturePath], { stdio: 'inherit' })

    // Test for valid syntax
    assert.equal(status, 0)

    idents.get('foo')!.read.forEach(read => {
      fooReads.push(read.start)
    })
    idents.get('bar')!.read.forEach(read => {
      barReads.push(read.start)
    })

    assert.deepEqual(fooReads, [0, 6, 244])
    assert.deepEqual(barReads, [39, 48, 144, 238])
  })

  it('correctly counts reads for hoisted var declarations', async () => {
    const fixturePath = join(fixtures, 'identifiers', 'hoisting', 'varDeclaration.js')
    const code = await readFile(fixturePath)
    const ast = parse('file.ts', code.toString())
    const idents = await collectModuleIdentifiers(ast.program, true)
    const someVarReads: number[] = []
    const otherVarReads: number[] = []
    const cVarReads: number[] = []
    const blockVarReads: number[] = []
    const innerBlockVarReads: number[] = []
    const catchVarReads: number[] = []
    const { status } = spawnSync('node', [fixturePath], { stdio: 'inherit' })

    // Test for valid syntax
    assert.equal(status, 0)

    idents.get('someVar')!.read.forEach(read => {
      someVarReads.push(read.start)
    })
    idents.get('otherVar')!.read.forEach(read => {
      otherVarReads.push(read.start)
    })
    idents.get('c')!.read.forEach(read => {
      cVarReads.push(read.start)
    })
    idents.get('block')!.read.forEach(read => {
      blockVarReads.push(read.start)
    })
    idents.get('innerBlock')!.read.forEach(read => {
      innerBlockVarReads.push(read.start)
    })
    idents.get('catchVar')!.read.forEach(read => {
      catchVarReads.push(read.start)
    })

    assert.deepEqual(someVarReads, [26])
    assert.deepEqual(otherVarReads, [87, 288, 358])
    assert.deepEqual(cVarReads, [139, 194, 245])
    assert.deepEqual(blockVarReads, [392])
    assert.deepEqual(innerBlockVarReads, [427])
    assert.deepEqual(catchVarReads, [536])
  })

  it('does not treat TDZ reads (let/const/class) as hoists', async () => {
    const fixturePath = join(fixtures, 'identifiers', 'hoisting', 'tdz.js')
    const code = await readFile(fixturePath)
    const ast = parse('file.ts', code.toString())
    const idents = await collectModuleIdentifiers(ast.program, true)
    const { status } = spawnSync('node', [fixturePath], { stdio: 'inherit' })

    // Test for valid syntax
    assert.equal(status, 0)

    // TDZ reads should not be recorded as safe hoists; they should be absent or zero reads.
    assert.equal(idents.get('foo')?.read.length ?? 0, 0)
    assert.equal(idents.get('bar')?.read.length ?? 0, 0)
    assert.equal(idents.get('Baz')?.read.length ?? 0, 0)
    assert.equal(idents.get('inner')?.read.length ?? 0, 0)
  })

  it('ignores import hoisting for identifier tracking', async () => {
    const fixturePath = join(fixtures, 'identifiers', 'hoisting', 'importHoist.js')
    const code = await readFile(fixturePath)
    const ast = parse('file.ts', code.toString())
    const idents = await collectModuleIdentifiers(ast.program, true)
    const { status } = spawnSync('node', [fixturePath], { stdio: 'inherit' })

    // Test for valid syntax
    assert.equal(status, 0)

    // Imported names should not be counted as module-scope hoists
    assert.equal(idents.has('x'), false)

    // Local reads of imported value still exist via binding 'x' inside the module
    // but they should not appear in module hoist tracking because x is not declared locally.
  })

  it('does not hoist function declarations inside blocks to module scope', async () => {
    const fixturePath = join(fixtures, 'identifiers', 'hoisting', 'functionInBlock.js')
    const code = await readFile(fixturePath)
    const ast = parse('file.ts', code.toString())
    const idents = await collectModuleIdentifiers(ast.program, true)
    const funcReads: number[] = []
    const { status } = spawnSync('node', [fixturePath], { stdio: 'inherit' })

    // Test for valid syntax
    assert.equal(status, 0)

    const funcMeta = idents.get('func')
    assert.equal(funcMeta, undefined)

    // Ensure no reads got captured as module-scope hoists
    assert.deepEqual(funcReads, [])
  })
})

describe('collectCjsExports', () => {
  it('collects aliases, literals, getters, and reassignments', async () => {
    const source = `
      const alias = exports;
      const mod = module.exports;
      const dyn = 'dyn';
      const num = 42;
      const tmpl = \`tmpl\`;
      let local = 1;
      const getter = function getter() { return local };
      const getter2 = getter;
      exports[tmpl] = local;
      alias.foo = local;
      mod['bar'] = num;
      exports[dyn] = 2;
      module.exports.baz = function baz() {};
      ({ value: module.exports.qux } = { value: 3 });
      Object.assign(exports, { assignVal: local, aliasAssign: num });
      Object.defineProperty(exports, 'dp', { get: getter });
      Object.defineProperties(module.exports, {
        multi: { value: num },
        got: { get: getter2 },
      });
      exports.fromLocal = local;
      local = 5;
    `

    const ast = parse('file.cjs', source).program
    const exportsMap = await collectCjsExports(ast)

    const keys = Array.from(exportsMap.keys()).sort()
    assert.deepEqual(keys, [
      'aliasAssign',
      'assignVal',
      'bar',
      'baz',
      'dp',
      'dyn',
      'foo',
      'fromLocal',
      'got',
      'multi',
      'qux',
      'tmpl',
    ])

    assert.equal(exportsMap.get('dyn')?.fromIdentifier, undefined)
    assert.equal(exportsMap.get('foo')?.fromIdentifier, 'local')
    assert.equal(exportsMap.get('bar')?.via.has('module.exports'), true)
    assert.equal(exportsMap.get('dp')?.hasGetter, true)
    assert.equal(exportsMap.get('got')?.hasGetter, true)
    assert.equal(exportsMap.get('multi')?.hasGetter ?? false, false)
    assert.equal(exportsMap.get('fromLocal')?.reassignments.length, 1)
    assert.equal(exportsMap.get('tmpl')?.writes.length ?? 0, 1)
  })
})

describe('getLangFromExt', () => {
  it('returns language for js-like extensions', () => {
    assert.equal(getLangFromExt('file.js'), 'js')
    assert.equal(getLangFromExt('file.mjs'), 'js')
  })

  it('returns language for ts-like extensions', () => {
    assert.equal(getLangFromExt('file.ts'), 'ts')
    assert.equal(getLangFromExt('file.d.ts'), 'ts')
  })

  it('returns language for tsx/jsx extensions', () => {
    assert.equal(getLangFromExt('file.tsx'), 'tsx')
    assert.equal(getLangFromExt('file.jsx'), 'jsx')
  })

  it('returns undefined for unknown extensions', () => {
    assert.equal(getLangFromExt('file.txt'), undefined)
  })
})
