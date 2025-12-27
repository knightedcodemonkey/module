import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolve, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

import { parse } from '../src/parse.js'
import { collectModuleIdentifiers } from '../src/utils.js'

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
})
