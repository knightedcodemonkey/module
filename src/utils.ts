import { extname } from 'node:path'
import { ancestorWalk } from '@knighted/walk'

import type { Node, IdentifierName } from 'oxc-parser'
import type { Specifier } from '@knighted/specifier'
import type { Identifiers } from './types.js'

type UpdateSrcLang = Parameters<Specifier['updateSrc']>[1]
const getLangFromExt = (filename: string): UpdateSrcLang => {
  const ext = extname(filename)

  if (/\.js$/.test(ext)) {
    return 'js'
  }

  if (/\.ts$/.test(ext)) {
    return 'ts'
  }

  if (ext === '.tsx') {
    return 'tsx'
  }

  if (ext === '.jsx') {
    return 'jsx'
  }
}
const isIdentifierName = (node: Node): node is IdentifierName => {
  return node.type === 'Identifier' && typeof node.name === 'string'
}
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
/**
 * Collects all module scope identifiers in the AST.
 * Ignores identifiers that are in functions or classes.
 *
 * Special case handling for these which create their own scopes, but are also valid module scope identifiers:
 * `ClassDeclaration`
 * `FunctionDeclaration`
 *
 * Special case handling for `var` inside top-level `BlockStatement` which are also valid module scope identifiers.
 *
 * @param ast - The AST to walk.
 */
const collectModuleIdentifiers = async (ast: Node, registry: Identifiers) => {
  const scopes: Set<string>[] = []
  const scopesWithoutBlock = [
    'FunctionDeclaration',
    'FunctionExpression',
    'ArrowFunctionExpression',
    'ClassDeclaration',
    'ClassBody',
  ]
  const scopeNodes = [...scopesWithoutBlock, 'BlockStatement']

  await ancestorWalk(ast, {
    enter(node, ancestors) {
      const { type } = node
      // Ancestors include the current node, so we need to skip the first one
      const parent = ancestors[ancestors.length - 2] ?? null

      if (scopeNodes.includes(type)) {
        scopes.push(new Set<string>())
      }

      // Add declarations and func params to the current scope

      if (type === 'VariableDeclarator' && scopes.length > 0) {
        const { id } = node

        if (isIdentifierName(id)) {
          const name = id.name
          const scope = scopes[scopes.length - 1]

          scope.add(name)
        }
      }

      if (type === 'ClassDeclaration' && scopes.length > 0) {
        const { id } = node
        if (id && isIdentifierName(id)) {
          const name = id.name
          const scope = scopes[scopes.length - 1]

          scope.add(name)
        }
      }

      if (
        type === 'FunctionDeclaration' ||
        type === 'FunctionExpression' ||
        type === 'ArrowFunctionExpression'
      ) {
        const params = node.params
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
          .filter(isIdentifierName)
        const scope = scopes[scopes.length - 1]

        params.forEach(param => {
          scope.add(param.name)
        })

        if (type === 'FunctionDeclaration' && node.id && isIdentifierName(node.id)) {
          scope.add(node.id.name)
        }
      }

      // Add module scope identifiers to the registry

      if (type === 'Identifier') {
        const { name } = node
        const meta = registry.get(name) ?? { declare: [], read: [] }
        const hasParent = parent !== null
        const grandParent = ancestors[ancestors.length - 3] ?? null
        const isDeclare =
          hasParent &&
          (parent.type === 'VariableDeclarator' ||
            parent.type === 'FunctionDeclaration' ||
            parent.type === 'ClassDeclaration') &&
          parent.id === node

        if (isDeclare) {
          //const grandParent = ancestors[ancestors.length - 3] ?? null
          const inClassOrFunc = scopes.length > 0 && scopes[scopes.length - 1].has(name)
          const isClassOrFuncDeclId =
            (parent.type === 'ClassDeclaration' ||
              parent.type === 'FunctionDeclaration') &&
            parent.id === node &&
            scopes.length === 1
          const isVarInTopLevelBlock =
            scopes.length === 1 &&
            grandParent?.type === 'VariableDeclaration' &&
            grandParent?.kind === 'var' &&
            !ancestors.some(ancestor => scopesWithoutBlock.includes(ancestor.type))

          if (!inClassOrFunc || isClassOrFuncDeclId || isVarInTopLevelBlock) {
            meta.declare.push(node)
            registry.set(name, meta)
          }
        } else {
          // TODO: This might require special logic for handling ClassDeclaration and FunctionDeclaration and hoisting
          const inScope = scopes.some(scope => scope.has(name))
          const notPropertyKey = parent.type !== 'Property' || parent.key !== node
          const isFuncExpressionId =
            parent.type === 'FunctionExpression' && parent.id === node
          const isExportSpecifierAlias =
            parent.type === 'ExportSpecifier' && parent.exported === node
          const isIife =
            parent.type === 'FunctionExpression' &&
            ancestors.some(ancestor => ancestor.type === 'ParenthesizedExpression')

          if (
            !inScope &&
            !isIife &&
            !isFuncExpressionId &&
            !isExportSpecifierAlias &&
            registry.has(name) &&
            parent.type !== 'MemberExpression' &&
            notPropertyKey
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
}

export {
  getLangFromExt,
  isIdentifierName,
  isValidUrl,
  collectModuleIdentifiers,
  exportsRename,
  requireMainRgx,
}
