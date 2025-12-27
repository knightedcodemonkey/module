import { ancestorWalk } from './walk.js'

import type { Node } from 'oxc-parser'

import type { IdentMeta, SpannedNode, Scope, CjsExport } from './types.js'
import { identifier } from './helpers/identifier.js'
import { scopeNodes } from './utils/scopeNodes.js'

const isValidUrl = (url: string) => {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}
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

const collectScopeIdentifiers = (node: Node, scopes: Scope[]) => {
  const { type } = node

  switch (type) {
    case 'BlockStatement':
    case 'ClassBody':
      scopes.push({ node, type: 'Block', name: type, idents: new Set<string>() })
      break
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      {
        const name = node.id ? node.id.name : 'anonymous'
        const scope = { node, name, type: 'Function', idents: new Set<string>() }

        node.params
          .map(param => {
            if (param.type === 'TSParameterProperty') {
              return param.parameter
            }

            if (param.type === 'RestElement') {
              return param.argument
            }

            if (param.type === 'AssignmentPattern') {
              return param.left
            }

            return param
          })
          .filter(identifier.isNamed)
          .forEach(param => {
            scope.idents.add(param.name)
          })

        /**
         * If a FunctionExpression has an id, it is a named function expression.
         * The function expression name shadows the module scope identifier, so
         * we don't want to count reads of module identifers that have the same name.
         * They also do not cause a SyntaxError if the function expression name is
         * the same as a module scope identifier.
         *
         * TODO: Is this necessary for FunctionDeclaration?
         */
        if (node.type === 'FunctionExpression' && node.id) {
          scope.idents.add(node.id.name)
        }

        // First add the function to any previous scopes
        if (scopes.length > 0) {
          scopes[scopes.length - 1].idents.add(name)
        }

        // Then add the function scope to the scopes stack
        scopes.push(scope)
      }
      break
    case 'ClassDeclaration':
      {
        const className = node.id ? node.id.name : 'anonymous'

        // First add the class to any previous scopes
        if (scopes.length > 0) {
          scopes[scopes.length - 1].idents.add(className)
        }

        // Then add the class to the scopes stack
        scopes.push({ node, name: className, type: 'Class', idents: new Set() })
      }
      break
    case 'ClassExpression':
      {
      }
      break
    case 'VariableDeclaration':
      if (scopes.length > 0) {
        const scope = scopes[scopes.length - 1]

        node.declarations.forEach(decl => {
          if (decl.type === 'VariableDeclarator' && decl.id.type === 'Identifier') {
            scope.idents.add(decl.id.name)
          }
        })
      }
      break
  }
}

/**
 * Collects all module scope identifiers in the AST.
 *
 * Ignores identifiers that are in functions or classes.
 * Ignores new scopes for StaticBlock nodes (can only reference static class members).
 *
 * Special case handling for these which create their own scopes,
 * but are also valid module scope identifiers:
 * - ClassDeclaration
 * - FunctionDeclaration
 *
 * Special case handling for var inside BlockStatement
 * which are also valid module scope identifiers.
 */
const collectModuleIdentifiers = async (ast: Node, hoisting: boolean = true) => {
  const identifiers = new Map<string, IdentMeta>()
  const globalReads = new Map<string, SpannedNode[]>()
  const scopes: Scope[] = []

  await ancestorWalk(ast, {
    enter(node, ancestors) {
      const { type } = node

      collectScopeIdentifiers(node, scopes)

      // Add module scope identifiers to the registry map

      if (type === 'Identifier') {
        const { name } = node
        const meta = identifiers.get(name) ?? { declare: [], read: [] }
        const isDeclaration = identifier.isDeclaration(ancestors)
        const inScope = scopes.some(
          scope => scope.idents.has(name) || scope.name === name,
        )

        if (
          hoisting &&
          !identifier.isDeclaration(ancestors) &&
          !identifier.isFunctionExpressionId(ancestors) &&
          !identifier.isExportSpecifierAlias(ancestors) &&
          !identifier.isClassPropertyKey(ancestors) &&
          !identifier.isMethodDefinitionKey(ancestors) &&
          !identifier.isMemberKey(ancestors) &&
          !identifier.isPropertyKey(ancestors) &&
          !identifier.isIife(ancestors) &&
          !inScope
        ) {
          if (globalReads.has(name)) {
            globalReads.get(name)?.push(node)
          } else {
            globalReads.set(name, [node])
          }
        }

        if (isDeclaration) {
          const isModuleScope = identifier.isModuleScope(ancestors)
          const isClassOrFuncDeclaration =
            identifier.isClassOrFuncDeclarationId(ancestors)
          const isVarDeclarationInGlobalScope =
            identifier.isVarDeclarationInGlobalScope(ancestors)

          const parent = ancestors[ancestors.length - 2]
          const grandParent = ancestors[ancestors.length - 3]
          const hoistSafe =
            parent.type === 'FunctionDeclaration' ||
            (parent.type === 'VariableDeclarator' &&
              grandParent?.type === 'VariableDeclaration' &&
              grandParent.kind === 'var')

          if (
            isModuleScope ||
            isClassOrFuncDeclaration ||
            isVarDeclarationInGlobalScope
          ) {
            meta.declare.push(node)

            // Check for hoisted reads
            if (hoisting && hoistSafe && globalReads.has(name)) {
              const reads = globalReads.get(name)

              if (reads) {
                reads.forEach(read => {
                  if (!meta.read.includes(read)) {
                    meta.read.push(read)
                  }
                })
              }
            }

            identifiers.set(name, meta)
          }
        } else {
          if (
            identifiers.has(name) &&
            !inScope &&
            !identifier.isIife(ancestors) &&
            !identifier.isFunctionExpressionId(ancestors) &&
            !identifier.isExportSpecifierAlias(ancestors) &&
            !identifier.isClassPropertyKey(ancestors) &&
            !identifier.isMethodDefinitionKey(ancestors) &&
            !identifier.isMemberKey(ancestors) &&
            !identifier.isPropertyKey(ancestors)
          ) {
            // Closure is referencing module scope identifier
            meta.read.push(node)
          }
        }
      }
    },
    leave(node) {
      const { type } = node

      if (scopeNodes.includes(type)) {
        scopes.pop()
      }
    },
  })

  return identifiers
}

export {
  isValidUrl,
  collectScopeIdentifiers,
  collectModuleIdentifiers,
  collectCjsExports,
  exportsRename,
  requireMainRgx,
}
