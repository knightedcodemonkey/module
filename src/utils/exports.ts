import type { Node } from 'oxc-parser'

import type { CjsExport } from '../types.js'
import { ancestorWalk } from '#walk'

const exportsRename = '__exports'
const requireMainRgx = /(require\.main\s*===\s*module|module\s*===\s*require\.main)/g

const literalPropName = (
  prop: Node,
  literals?: Map<string, string | number>,
): string | null => {
  if (prop.type === 'Identifier') return literals?.get(prop.name)?.toString() ?? prop.name
  if (
    prop.type === 'Literal' &&
    (typeof prop.value === 'string' || typeof prop.value === 'number')
  ) {
    return String(prop.value)
  }
  if (
    prop.type === 'TemplateLiteral' &&
    prop.expressions.length === 0 &&
    prop.quasis.length === 1
  ) {
    return prop.quasis[0].value.cooked ?? prop.quasis[0].value.raw
  }
  return null
}

type ExportRef = { key: string; via: 'exports' | 'module.exports' }
type SimpleIdentifier = { type: 'Identifier'; name: string }

const resolveExportTarget = (
  node: Node,
  aliases: Map<string, ExportRef['via']>,
  literals?: Map<string, string | number>,
) => {
  if (node.type === 'Identifier' && node.name === 'exports') {
    return { key: 'default', via: 'exports' as const }
  }

  if (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === 'module' &&
    node.property.type === 'Identifier' &&
    node.property.name === 'exports'
  ) {
    return { key: 'default', via: 'module.exports' as const }
  }

  if (node.type !== 'MemberExpression') return null

  const base = node.object
  const prop = node.property
  const key = literalPropName(prop, literals)
  if (!key) return null

  const baseVia = resolveBase(base, aliases)
  if (!baseVia) return null

  if (baseVia === 'module.exports' && key === 'exports') {
    return { key: 'default', via: 'module.exports' as const }
  }

  return { key, via: baseVia }
}

const resolveBase = (
  node: Node,
  aliases: Map<string, ExportRef['via']>,
): ExportRef['via'] | null => {
  if (node.type === 'Identifier') {
    if (node.name === 'exports') return 'exports'
    const alias = aliases.get(node.name)
    if (alias) return alias
  }

  if (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === 'module' &&
    node.property.type === 'Identifier' &&
    node.property.name === 'exports'
  ) {
    return 'module.exports'
  }

  return null
}

const collectCjsExports = async (ast: Node) => {
  const exportsMap = new Map<string, CjsExport>()
  const localToExport = new Map<string, Set<string>>()
  const aliases = new Map<string, ExportRef['via']>()
  const literals = new Map<string, string | number>()

  const addExport = (ref: ExportRef, node: Node, rhs?: SimpleIdentifier) => {
    const entry = exportsMap.get(ref.key) ?? {
      key: ref.key,
      writes: [],
      via: new Set(),
      reassignments: [],
    }

    entry.via.add(ref.via)
    entry.writes.push(node as any)

    if (rhs) {
      entry.fromIdentifier ??= rhs.name
      const set = localToExport.get(rhs.name) ?? new Set<string>()
      set.add(ref.key)
      localToExport.set(rhs.name, set)
    }

    exportsMap.set(ref.key, entry)
  }

  await ancestorWalk(ast, {
    enter(node) {
      if (
        node.type === 'VariableDeclarator' &&
        node.id.type === 'Identifier' &&
        node.init
      ) {
        const via = resolveBase(node.init, aliases)
        if (via) {
          aliases.set(node.id.name, via)
        }

        if (
          node.init.type === 'Literal' &&
          (typeof node.init.value === 'string' || typeof node.init.value === 'number')
        ) {
          literals.set(node.id.name, node.init.value)
        }

        if (
          node.init.type === 'TemplateLiteral' &&
          node.init.expressions.length === 0 &&
          node.init.quasis.length === 1
        ) {
          const cooked = node.init.quasis[0].value.cooked ?? node.init.quasis[0].value.raw
          literals.set(node.id.name, cooked)
        }
      }

      if (node.type === 'AssignmentExpression') {
        const target = resolveExportTarget(node.left, aliases, literals)

        if (target) {
          const rhsIdent =
            node.right.type === 'Identifier'
              ? (node.right as SimpleIdentifier)
              : undefined
          addExport(target, node, rhsIdent)
          return
        }

        if (node.left.type === 'Identifier') {
          const keys = localToExport.get(node.left.name)

          if (keys) {
            keys.forEach(key => {
              const entry = exportsMap.get(key)
              if (entry) {
                entry.reassignments.push(node as any)
                exportsMap.set(key, entry)
              }
            })
          }
        }

        if (node.left.type === 'ObjectPattern') {
          for (const prop of node.left.properties) {
            if (prop.type === 'Property' && prop.value.type === 'MemberExpression') {
              const ref = resolveExportTarget(prop.value, aliases, literals)
              if (ref) {
                addExport(ref, node)
              }
            }
          }
        }
      }

      if (node.type === 'CallExpression') {
        // Object.assign(exports, { foo: bar })
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'Object' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'assign' &&
          node.arguments.length >= 2
        ) {
          const targetArg = node.arguments[0]
          const ref = resolveBase(targetArg as Node, aliases)
          if (!ref) return

          for (let i = 1; i < node.arguments.length; i++) {
            const arg = node.arguments[i]
            if (arg.type === 'ObjectExpression') {
              for (const prop of arg.properties) {
                if (prop.type !== 'Property') continue
                const keyName = literalPropName(prop.key, literals)
                if (!keyName) continue

                let rhsIdent: SimpleIdentifier | undefined
                if (prop.value.type === 'Identifier') {
                  rhsIdent = prop.value as SimpleIdentifier
                }

                addExport({ key: keyName, via: ref }, node, rhsIdent)
              }
            }
          }
        }
      }
    },
  })

  return exportsMap
}

export { exportsRename, requireMainRgx, collectCjsExports }
