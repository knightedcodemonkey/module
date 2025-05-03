import { extname } from 'node:path'
import { ancestorWalk } from '@knighted/walk'

import type { Node, IdentifierName } from 'oxc-parser'
import type { Specifier } from '@knighted/specifier'
import type { IdentMeta } from './types.js'

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
 *
 * Ignores identifiers that are in functions or classes.
 * Ignores new scopes for StaticBlock nodes (can only reference static class members).
 *
 * Special case handling for these which create their own scopes,
 * but are also valid module scope identifiers:
 * - ClassDeclaration
 * - FunctionDeclaration
 *
 * Special case handling for var inside top-level BlockStatement
 * which are also valid module scope identifiers.
 */
const collectModuleIdentifiers = async (ast: Node) => {
  const identifiers = new Map<string, IdentMeta>()
  const scopes: { type: string; name: string; node: Node; idents: Set<string> }[] = []
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

      switch (type) {
        case 'BlockStatement':
        case 'ClassBody':
          scopes.push({ node, type: 'Block', name: type, idents: new Set<string>() })
          break
        case 'FunctionDeclaration':
        case 'FunctionExpression':
        case 'ArrowFunctionExpression':
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
            .filter(isIdentifierName)
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
          break
        case 'ClassDeclaration':
          const className = node.id ? node.id.name : 'anonymous'

          // First add the class to any previous scopes
          if (scopes.length > 0) {
            scopes[scopes.length - 1].idents.add(className)
          }

          // Then add the class to the scopes stack
          scopes.push({ node, name: className, type: 'Class', idents: new Set() })
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

      // Add module scope identifiers to the registry map

      if (type === 'Identifier') {
        const { name } = node
        const meta = identifiers.get(name) ?? { declare: [], read: [] }
        const hasParent = parent !== null
        const grandParent = ancestors[ancestors.length - 3] ?? null
        const isDeclare =
          hasParent &&
          (parent.type === 'VariableDeclarator' ||
            parent.type === 'FunctionDeclaration' ||
            parent.type === 'ClassDeclaration') &&
          parent.id === node

        if (isDeclare) {
          const isTopLevel = scopes.length === 0
          const isClassOrFuncDeclId =
            (parent.type === 'ClassDeclaration' ||
              parent.type === 'FunctionDeclaration') &&
            parent.id === node &&
            scopes.length === 1
          const isVarInTopLevelBlock =
            scopes.length === 1 &&
            grandParent?.type === 'VariableDeclaration' &&
            grandParent?.kind === 'var' &&
            // TODO: check if this is necessary
            !ancestors.some(ancestor => scopesWithoutBlock.includes(ancestor.type))

          if (isTopLevel || isClassOrFuncDeclId || isVarInTopLevelBlock) {
            meta.declare.push(node)
            identifiers.set(name, meta)
          }
        } else {
          // TODO: var and FunctionDeclaration and hoisting
          const inScope = scopes.some(
            scope => scope.idents.has(name) || scope.name === name,
          )
          const isFuncExpressionId =
            parent.type === 'FunctionExpression' && parent.id === node
          const isExportSpecifierAlias =
            parent.type === 'ExportSpecifier' && parent.exported === node
          const isIife =
            parent.type === 'FunctionExpression' &&
            ancestors.some(ancestor => ancestor.type === 'ParenthesizedExpression')
          const isClassPropertyKey =
            parent.type === 'PropertyDefinition' && parent.key === node
          const isMethodDefinitionKey =
            parent.type === 'MethodDefinition' && parent.key === node
          const isMemberKey =
            parent.type === 'MemberExpression' && parent.property === node
          const isPropertyKey = parent.type === 'Property' && parent.key === node

          if (
            identifiers.has(name) &&
            !inScope &&
            !isIife &&
            !isFuncExpressionId &&
            !isExportSpecifierAlias &&
            !isClassPropertyKey &&
            !isMethodDefinitionKey &&
            !isMemberKey &&
            !isPropertyKey
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
  getLangFromExt,
  isIdentifierName,
  isValidUrl,
  collectModuleIdentifiers,
  exportsRename,
  requireMainRgx,
}
