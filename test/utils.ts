import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolve, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { parse } from '../src/parse.js'
import { collectModuleIdentifiers } from '../src/utils.js'

// Use fixtures to more easily track character offsets and line numbers in test cases.
const fixtures = resolve(import.meta.dirname, 'fixtures')

describe('collectModuleIdentifiers', () => {
  it('collects identifiers declarations in top-level module scope', async () => {
    const code = await readFile(join(fixtures, 'identifiers', 'declarations.js'))
    const ast = parse('file.ts', code.toString())
    const idents = await collectModuleIdentifiers(ast.program)
    const keys = Array.from(idents.keys())

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
    ])
    assert.equal(idents.get('c')!.read.length, 1)
    assert.equal(idents.get('b')!.read.length, 1)
    assert.equal(idents.get('a')!.read.length, 0)
  })

  it('records subsequent reads of collected identifiers', async () => {
    const code = await readFile(join(fixtures, 'identifiers', 'reads.js'))
    const ast = parse('file.ts', code.toString())
    const idents = await collectModuleIdentifiers(ast.program)
    const reads: number[] = []

    idents.get('a')!.read.forEach((read) => {
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
})
