import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { ancestorWalk } from '@knighted/walk'

import { parse } from '#parse'
import { identifier } from '#helpers/identifier'

const { isModuleScope } = identifier

describe('isModuleScope', () => {
  it.skip('finds module scope identifiers', async () => {
    const ast = parse(
      'file.ts',
      `
      import { foo } from 'foo.js'
      import * as bar from 'bar.js'
      import { bazz as baz } from 'baz.js'
      import qux from 'qux.js'

      const a = 1;
      let b = 2;
      var c = 3;
      const d = () => {}
      // f should not be global.
      const e = function f() {}
      // h should not be global.
      const g = class h {}
      class i {}
      function j() {}
    `,
    )

    await ancestorWalk(ast.program, {
      enter(node, ancestors) {
        if (node.type === 'Identifier') {
          const { name } = node
          switch (name) {
            case 'a':
            case 'b':
            case 'c':
            case 'd':
            case 'e':
            case 'g':
            case 'i':
            case 'j':
              assert.equal(isModuleScope(ancestors), true)
              assert.equal(isModuleScope(ancestors, true), true)
              break
            case 'f':
            case 'h':
              assert.equal(isModuleScope(ancestors), false)
              assert.equal(isModuleScope(ancestors, true), false)
              break
            case 'foo':
            case 'bar':
            case 'baz':
            case 'qux':
              assert.equal(isModuleScope(ancestors), false)
              assert.equal(isModuleScope(ancestors, true), true)
              break
          }
        }
      },
    })
  })

  it('discerns member expressions, object properties, and destructuring', async () => {
    let ast = parse(
      'file.ts',
      `
        var x = 'xx'
        var y = 'yy'
        const a = { b: 'b' }
        const { b: c } = a
        const { xx: computed } = { [x]: 'e' }
        const f = { d: 'g', yy: y }
        const { [y]: h } = f

        a.b
        f[y]
      `,
    )
    await ancestorWalk(ast.program, {
      enter(node, ancestors) {
        if (node.type === 'Identifier') {
          const { name } = node
          switch (name) {
            case 'x':
            case 'y':
            case 'a':
            case 'c':
            case 'computed':
            case 'f':
            case 'h':
              assert.equal(isModuleScope(ancestors), true)
              break
            case 'b':
            case 'd':
            case 'yy':
              assert.equal(isModuleScope(ancestors), false)
              break
          }
        }
      },
    })

    ast = parse(
      'file.ts',
      `
          function scope() {
            var x = 'xx'
            var y = 'yy'
            const a = { b: 'b' }
            const { b: c } = a
            const { xx: computed } = { [x]: 'e' }
            const f = { d: 'g', yy: y }
            const { [y]: h } = f

            a.b
            f[y]
          }

          {
            var x = 'xx'
            var y = 'yy'
            const a = { b: 'b' }
            const { b: c } = a
            const { xx: computed } = { [x]: 'e' }
            const f = { d: 'g', yy: y }
            const { [y]: h } = f

            a.b
            f[y]
          }
      `,
    )
    await ancestorWalk(ast.program, {
      enter(node, ancestors) {
        if (node.type === 'Identifier') {
          const { name } = node
          switch (name) {
            case 'x':
            case 'y':
            case 'a':
            case 'b':
            case 'c':
            case 'd':
            case 'yy':
            case 'computed':
            case 'f':
            case 'h':
              assert.equal(isModuleScope(ancestors), false)
              break
          }
        }
      },
    })

    ast = parse(
      'file.ts',
      `
          const obj = {a: undefined, b: [2], c: 3};
          const e = 'e'
          const {g = e, b: d, ...rest} = obj;
          const {b: [bb] = 'x'} = obj;

          const scope = () => {
            const o = {f: undefined, h: [2], i: 3};
            const j = 'j'
            const {k = j, h: l, ...others} = o;
            const {h: [m] = 'x'} = o;
          }
        `,
    )
    await ancestorWalk(ast.program, {
      enter(node, ancestors) {
        if (node.type === 'Identifier') {
          const { name } = node
          switch (name) {
            case 'obj':
            case 'e':
            case 'g':
            case 'd':
            case 'rest':
            case 'bb':
            case 'scope':
              assert.equal(isModuleScope(ancestors), true)
              break
            case 'a':
            case 'b':
            case 'c':
            case 'o':
            case 'f':
            case 'h':
            case 'i':
            case 'j':
            case 'k':
            case 'l':
            case 'others':
            case 'm':
              assert.equal(isModuleScope(ancestors), false)
              break
          }
        }
      },
    })

    ast = parse(
      'file.ts',
      `
        const a = ['w', 'x', 'y', 'z']
        const b = 0
        const [c, d, ...rest] = a
        const [e = 'w'] = a
        const [h, ...{f, g: gg}] = a
        let i, j, others

        [...[i, j, ...others]] = a

        a[b]
        a[1]
      `,
    )
    await ancestorWalk(ast.program, {
      enter(node, ancestors) {
        if (node.type === 'Identifier') {
          const { name } = node
          switch (name) {
            case 'a':
            case 'b':
            case 'c':
            case 'd':
            case 'rest':
            case 'e':
            case 'h':
            case 'f':
            case 'gg':
            case 'i':
            case 'j':
            case 'others':
              assert.equal(isModuleScope(ancestors), true)
              break
            case 'g':
            case '1':
              assert.equal(isModuleScope(ancestors), false)
              break
          }
        }
      },
    })

    // Not considering meta properties as module scope.
    ast = parse(
      'file.ts',
      `
        import.meta
        import.meta.url
        import.meta.resolve('foo.js')
      `,
    )
    await ancestorWalk(ast.program, {
      enter(node, ancestors) {
        if (node.type === 'Identifier') {
          const { name } = node
          switch (name) {
            case 'import':
            case 'meta':
            case 'url':
            case 'resolve':
              assert.equal(isModuleScope(ancestors), false)
              break
          }
        }
      },
    })
  })

  describe('while ignoring', () => {
    it.skip('identifiers inside function scopes', async () => {
      const ast = parse(
        'file.ts',
        `
          const alpha = () => {
            const a = 'a'
          }
          const beta = function () {
            let b = 'b'
          }
          function gamma () {
            var c = 'c'
          }
        `,
      )

      await ancestorWalk(ast.program, {
        enter(node, ancestors) {
          if (node.type === 'Identifier') {
            const { name } = node
            switch (name) {
              case 'alpha':
              case 'beta':
              case 'gamma':
                assert.equal(isModuleScope(ancestors), true)
                break
              case 'a':
              case 'b':
              case 'c':
                assert.equal(isModuleScope(ancestors), false)
                break
            }
          }
        },
      })
    })

    it.skip('identifiers inside class scopes', async () => {
      const ast = parse(
        'file.ts',
        `
        class alpha {
          static a
          static {
            const b = 'b'
            this.a = 'aa'
          }

          c = 'c'
          d() {
            const e = 'e'
          }
        }
        const beta = class {
          constructor() {
            this.f = 'f'
          }
          get g() {}
          set h(i) {}
          *j() {
            yield 1
          }
        }
      `,
      )

      await ancestorWalk(ast.program, {
        enter(node, ancestors) {
          if (node.type === 'Identifier') {
            const { name } = node
            switch (name) {
              case 'alpha':
              case 'beta':
                assert.equal(isModuleScope(ancestors), true)
                break
              case 'a':
              case 'b':
              case 'c':
              case 'd':
              case 'e':
              case 'f':
              case 'g':
              case 'h':
              case 'i':
                assert.equal(isModuleScope(ancestors), false)
                break
            }
          }
        },
      })
    })

    it.skip('identifiers inside block scopes', async () => {
      const ast = parse(
        'file.ts',
        `
          {
            const a = 'a'
            let b = 'b'
            var c = 'c'
          }
          if (c === 'c') {
            const f = 'f'
            let g = 'g'
            var h = 'h'
            c = f + g + h
          }
          for (let i = 0; i < 10; i++) {
            const j = 'j'
            var jj = i + j
          }
          while (false) {
            let k = 'k'
            var kk = 'kk'
          }
          do {
            const l = 'l'
            var ll = 'll'
          } while (false)
          switch (true) {
            case true:
              const m = 'm'
              var mm = 'mm'
            default:
              const n = 'n'
              var nn = 'nn'
          }

          {
            var x = 'x'
            {
              var y = 'y'

              if (x) {
                var z = 'z'
              }

              function innerFunction() {
                var innerVar = 'inner'
                return innerVar
              }
            }
          }
      `,
      )

      await ancestorWalk(ast.program, {
        enter(node, ancestors) {
          if (node.type === 'Identifier') {
            const { name } = node
            switch (name) {
              case 'a':
              case 'b':
              case 'f':
              case 'g':
              case 'i':
              case 'j':
              case 'k':
              case 'l':
              case 'm':
              case 'n':
              case 'innerFunction':
              case 'innerVar':
                assert.equal(isModuleScope(ancestors), false)
                break
              // var hoisted identifiers
              case 'c':
              case 'h':
              case 'jj':
              case 'kk':
              case 'll':
              case 'mm':
              case 'nn':
              case 'x':
              case 'y':
              case 'z':
                assert.equal(isModuleScope(ancestors), true)
                break
            }
          }
        },
      })
    })
  })
})
