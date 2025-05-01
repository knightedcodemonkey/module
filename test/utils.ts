import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolve, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { parse } from '../src/parse.js'
import { collectModuleIdentifiers } from '../src/utils.js'

const fixtures = resolve(import.meta.dirname, 'fixtures')

describe('collectModuleIdentifiers', () => {
  it('collects identifiers declarations in top-level module scope', async () => {
    const code = await readFile(join(fixtures, 'identifiers', 'declarations.js'))
    const ast = parse('file.ts', code.toString())
    const idents = new Map()
    await collectModuleIdentifiers(ast.program, idents)
    const keys = Array.from(idents.keys())

    assert.equal(keys.length, 10)
    assert.deepEqual(keys, ['a', 'b', 'c', 'd', 'foo', 'bar', 'theta', 'f', 'l', 'p'])
    assert.equal(idents.get('c').read.length, 1)
    assert.equal(idents.get('b').read.length, 1)
    assert.equal(idents.get('a').read.length, 0)
  })

  it('records subsequent reads of collected identifiers', async () => {
    const code = await readFile(join(fixtures, 'identifiers', 'reads.js'))
    const ast = parse('file.ts', code.toString())
    const idents = new Map()
    await collectModuleIdentifiers(ast.program, idents)
    const keys = Array.from(idents.keys())

    idents.get('a').read.forEach((read, i) => {
      //console.log(read)
    })
    assert.equal(idents.get('a').read.length, 16)
  })
})
