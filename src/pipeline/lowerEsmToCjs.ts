import MagicString from 'magic-string'

import { defaultInteropName } from './interopHelpers.js'

import {
  getModuleExportName,
  type ImportDefaultSpecifierNode,
  type ImportNamespaceSpecifierNode,
  type ImportSpecifierNode,
  type ModuleExportNameNode,
  type ProgramNode,
} from '../helpers/ast.js'
import type { FormatterOptions } from '../types.js'

const isValidIdent = (name: string) => /^[$A-Z_a-z][$\w]*$/.test(name)

const exportAssignment = (
  name: string,
  expr: string,
  live: 'strict' | 'loose' | 'off',
) => {
  const prop = isValidIdent(name) ? `.${name}` : `[${JSON.stringify(name)}]`
  if (live === 'strict') {
    const key = JSON.stringify(name)
    return `Object.defineProperty(exports, ${key}, { enumerable: true, get: () => ${expr} });`
  }
  return `exports${prop} = ${expr};`
}

type ImportTransform = {
  start: number
  end: number
  code: string
  needsInterop: boolean
}

type ExportTransform = {
  start: number
  end: number
  code: string
  needsInterop?: boolean
}

const lowerEsmToCjs = (
  program: ProgramNode,
  code: MagicString,
  opts: FormatterOptions,
  containsTopLevelAwait: boolean,
) => {
  const live = opts.liveBindings ?? 'strict'
  const importTransforms: ImportTransform[] = []
  const exportTransforms: ExportTransform[] = []
  let needsInterop = false
  let importIndex = 0

  for (const node of program.body) {
    if (node.type === 'ImportDeclaration') {
      const srcLiteral = code.slice(node.source.start, node.source.end)
      const specifiers = node.specifiers ?? []
      const defaultSpec = specifiers.find(
        (s): s is ImportDefaultSpecifierNode => s.type === 'ImportDefaultSpecifier',
      )
      const namespaceSpec = specifiers.find(
        (s): s is ImportNamespaceSpecifierNode => s.type === 'ImportNamespaceSpecifier',
      )
      const namedSpecs = specifiers.filter(
        (s): s is ImportSpecifierNode => s.type === 'ImportSpecifier',
      )

      if (!specifiers.length) {
        importTransforms.push({
          start: node.start,
          end: node.end,
          code: `require(${srcLiteral});\n`,
          needsInterop: false,
        })
        continue
      }

      const modIdent = `__mod${importIndex++}`
      const lines: string[] = []

      lines.push(`const ${modIdent} = require(${srcLiteral});`)

      if (namespaceSpec) {
        lines.push(`const ${namespaceSpec.local.name} = ${modIdent};`)
      }

      if (defaultSpec) {
        let init = modIdent
        switch (opts.cjsDefault) {
          case 'module-exports':
            init = modIdent
            break
          case 'none':
            init = `${modIdent}.default`
            break
          case 'auto':
          default:
            init = `${defaultInteropName}(${modIdent})`
            needsInterop = true
            break
        }
        lines.push(`const ${defaultSpec.local.name} = ${init};`)
      }

      if (namedSpecs.length) {
        const pairs = namedSpecs.map(s => {
          const imported = getModuleExportName(s.imported as ModuleExportNameNode)
          if (!imported) return s.local.name
          const local = s.local.name
          return imported === local ? imported : `${imported}: ${local}`
        })
        lines.push(`const { ${pairs.join(', ')} } = ${modIdent};`)
      }

      importTransforms.push({
        start: node.start,
        end: node.end,
        code: `${lines.join('\n')}\n`,
        needsInterop,
      })
    }

    if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration) {
        const decl = node.declaration
        const declSrc = code.slice(decl.start, decl.end)
        const exportedNames: string[] = []

        if (decl.type === 'VariableDeclaration') {
          for (const d of decl.declarations) {
            if (d.id.type === 'Identifier') {
              exportedNames.push(d.id.name)
            }
          }
        } else if ('id' in decl && decl.id?.type === 'Identifier') {
          exportedNames.push(decl.id.name)
        }

        const exportLines = exportedNames.map(name => exportAssignment(name, name, live))

        exportTransforms.push({
          start: node.start,
          end: node.end,
          code: `${declSrc}\n${exportLines.join('\n')}\n`,
        })
        continue
      }

      if (node.specifiers?.length) {
        if (node.source) {
          const srcLiteral = code.slice(node.source.start, node.source.end)
          const modIdent = `__mod${importIndex++}`
          const lines = [`const ${modIdent} = require(${srcLiteral});`]

          for (const spec of node.specifiers) {
            if (spec.type !== 'ExportSpecifier') continue
            const exported = getModuleExportName(spec.exported as ModuleExportNameNode)
            const imported = getModuleExportName(spec.local as ModuleExportNameNode)
            if (!exported || !imported) continue

            let rhs = `${modIdent}.${imported}`
            if (imported === 'default') {
              rhs = `${defaultInteropName}(${modIdent})`
              needsInterop = true
            }

            lines.push(exportAssignment(exported, rhs, live))
          }

          exportTransforms.push({
            start: node.start,
            end: node.end,
            code: `${lines.join('\n')}\n`,
            needsInterop,
          })
        } else {
          const lines: string[] = []
          for (const spec of node.specifiers) {
            if (spec.type !== 'ExportSpecifier') continue
            const exported = getModuleExportName(spec.exported as ModuleExportNameNode)
            const local = getModuleExportName(spec.local as ModuleExportNameNode)
            if (!exported || !local) continue

            lines.push(exportAssignment(exported, local, live))
          }
          exportTransforms.push({
            start: node.start,
            end: node.end,
            code: `${lines.join('\n')}\n`,
          })
        }
      }
    }

    if (node.type === 'ExportDefaultDeclaration') {
      const decl = node.declaration
      const useExportsObject = containsTopLevelAwait && opts.topLevelAwait !== 'error'
      if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
        if (decl.id?.name) {
          const declSrc = code.slice(decl.start, decl.end)
          const assign = useExportsObject
            ? `exports.default = ${decl.id.name};`
            : `module.exports = ${decl.id.name};`
          exportTransforms.push({
            start: node.start,
            end: node.end,
            code: `${declSrc}\n${assign}\n`,
          })
        } else {
          const declSrc = code.slice(decl.start, decl.end)
          const assign = useExportsObject
            ? `exports.default = ${declSrc};`
            : `module.exports = ${declSrc};`
          exportTransforms.push({
            start: node.start,
            end: node.end,
            code: `${assign}\n`,
          })
        }
      } else {
        const exprSrc = code.slice(decl.start, decl.end)
        const assign = useExportsObject
          ? `exports.default = ${exprSrc};`
          : `module.exports = ${exprSrc};`
        exportTransforms.push({
          start: node.start,
          end: node.end,
          code: `${assign}\n`,
        })
      }
    }

    if (node.type === 'ExportAllDeclaration') {
      const srcLiteral = code.slice(node.source.start, node.source.end)
      if ('exported' in node && node.exported) {
        const exported = getModuleExportName(node.exported as ModuleExportNameNode)
        if (!exported) continue
        const modIdent = `__mod${importIndex++}`
        const lines = [
          `const ${modIdent} = require(${srcLiteral});`,
          exportAssignment(exported, modIdent, live),
        ]
        exportTransforms.push({
          start: node.start,
          end: node.end,
          code: `${lines.join('\n')}\n`,
        })
      } else {
        const modIdent = `__mod${importIndex++}`
        const lines = [`const ${modIdent} = require(${srcLiteral});`]
        const loop = `for (const k in ${modIdent}) {\n  if (k === 'default') continue;\n  if (!Object.prototype.hasOwnProperty.call(${modIdent}, k)) continue;\n  Object.defineProperty(exports, k, { enumerable: true, get: () => ${modIdent}[k] });\n}`
        lines.push(loop)
        exportTransforms.push({
          start: node.start,
          end: node.end,
          code: `${lines.join('\n')}\n`,
        })
      }
    }
  }

  return { importTransforms, exportTransforms, needsInterop }
}

export { exportAssignment, lowerEsmToCjs, type ExportTransform, type ImportTransform }
