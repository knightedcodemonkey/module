import foo from './file.mts'
import bar from './file.cts'
import baz from './file.ts'

import(`./${foo}${bar}${baz}.cjs`)
import(new String('not-relative.js'))
import(new String('./file.mjs'))

import.meta.resolve('./file.cjs')
import.meta.resolve('./file.js')
