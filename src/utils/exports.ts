import type { Node } from 'oxc-parser'

import type { CjsExport } from '../types.js'
import { ancestorWalk } from '../walk.js'

const exportsRename = '__exports'
const requireMainRgx = /(require\.main\s*===\s*module|module\s*===\s*require\.main)/g

const resolveExportTarget = (node: Node) => {
  if (node.type !== 'MemberExpression') return null

  const base = node.object
  const prop = node.property

  if (prop.type !== 'Identifier') return null

  if (base.type === 'Identifier' && base.name === 'exports') {
    return { key: prop.name, via: 'exports' as const }
  }

  if (
    base.type === 'MemberExpression' &&
    base.object.type === 'Identifier' &&
    base.object.name === 'module' &&
    base.property.type === 'Identifier' &&
    base.property.name === 'exports'
  ) {
    return { key: prop.name, via: 'module.exports' as const }
  }

  if (
    base.type === 'Identifier' &&
    base.name === 'module' &&
    prop.type === 'Identifier' &&
    prop.name === 'exports'
  ) {
    return { key: 'default', via: 'module.exports' as const }
  }

  return null
}

const collectCjsExports = async (ast: Node) => {
  const exportsMap = new Map<string, CjsExport>()
  const localToExport = new Map<string, Set<string>>()

  await ancestorWalk(ast, {
    enter(node) {
      if (node.type === 'AssignmentExpression') {
        const target = resolveExportTarget(node.left)

        if (target) {
          const entry = exportsMap.get(target.key) ?? {
            key: target.key,
            writes: [],
            via: new Set(),
            reassignments: [],
          }

          entry.via.add(target.via)
          entry.writes.push(node)

          if (node.right.type === 'Identifier') {
            entry.fromIdentifier ??= node.right.name
            if (entry.fromIdentifier) {
              const set = localToExport.get(entry.fromIdentifier) ?? new Set<string>()
              set.add(target.key)
              localToExport.set(entry.fromIdentifier, set)
            }
          }

          exportsMap.set(target.key, entry)
          return
        }

        if (node.left.type === 'Identifier') {
          const keys = localToExport.get(node.left.name)

          if (keys) {
            keys.forEach(key => {
              const entry = exportsMap.get(key)
              if (entry) {
                entry.reassignments.push(node)
                exportsMap.set(key, entry)
              }
            })
          }
        }
      }
    },
  })

  return exportsMap
}

export { exportsRename, requireMainRgx, collectCjsExports }
