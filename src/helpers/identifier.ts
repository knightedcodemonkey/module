import type { Node, IdentifierName } from 'oxc-parser'
import { analyze, type Scope as PeriscopicScope } from 'periscopic'

/**
 * Focus exclusively on IdentifierName type as it has the name property,
 * which is what the identifer utilities are interested in.
 *
 * Explicitly ignore the TSThisParameter type as it is not a valid identifier name.
 */
const isIdentifierName = (node: Node): node is IdentifierName => {
  return (
    node.type === 'Identifier' && typeof node.name === 'string' && node.name !== 'this'
  )
}

type ScopeContext = {
  scope: PeriscopicScope
}

const scopeCache = new WeakMap<Node, ScopeContext>()

const getScopeContext = (program: Node): ScopeContext => {
  const cached = scopeCache.get(program)

  if (cached) {
    return cached
  }

  const { scope } = analyze(program as any)
  const context = { scope }
  scopeCache.set(program, context)
  return context
}

/**
 * All methods receive the full set of ancestors, which
 * specifically includes the node itself as the last element.
 * The second to last element is the parent node, and so on.
 * The first element is the root node.
 */
const identifier = {
  isNamed: (node: Node): node is IdentifierName => {
    return isIdentifierName(node)
  },
  isMetaProperty(ancestors: Node[]) {
    const parent = ancestors[ancestors.length - 2]

    return (
      parent.type === 'MetaProperty' ||
      (parent.type === 'MemberExpression' && parent.object.type === 'MetaProperty')
    )
  },
  isModuleScope(ancestors: Node[], includeImports = false) {
    const node = ancestors[ancestors.length - 1]
    const parent = ancestors[ancestors.length - 2]
    const program = ancestors[0]

    if (
      !identifier.isNamed(node) ||
      identifier.isMetaProperty(ancestors) ||
      parent.type === 'LabeledStatement' ||
      parent.type === 'BreakStatement' ||
      parent.type === 'ContinueStatement'
    ) {
      return false
    }

    if (
      parent.type === 'ImportSpecifier' ||
      parent.type === 'ImportDefaultSpecifier' ||
      parent.type === 'ImportNamespaceSpecifier'
    ) {
      return includeImports && parent.local.name === node.name
    }

    if (parent.type === 'Property' && parent.key === node && !parent.computed) {
      return false
    }

    if (
      parent.type === 'MemberExpression' &&
      parent.property === node &&
      !parent.computed
    ) {
      return false
    }

    const { scope: rootScope } = getScopeContext(program)
    const owner = rootScope.find_owner(node.name)

    if (!owner) {
      return node.name === 'exports'
    }

    return owner === rootScope
  },

  isMemberExpressionRoot(ancestors: Node[]) {
    const node = ancestors[ancestors.length - 1]
    const parent = ancestors[ancestors.length - 2]
    const grandParent = ancestors[ancestors.length - 3]

    return (
      parent.type === 'MemberExpression' &&
      parent.object === node &&
      grandParent.type !== 'MemberExpression'
    )
  },

  isDeclaration(ancestors: Node[]) {
    const node = ancestors[ancestors.length - 1]
    const parent = ancestors[ancestors.length - 2]

    return (
      (parent.type === 'VariableDeclarator' ||
        parent.type === 'FunctionDeclaration' ||
        parent.type === 'ClassDeclaration') &&
      parent.id === node
    )
  },

  isClassOrFuncDeclarationId(ancestors: Node[]) {
    const node = ancestors[ancestors.length - 1]
    const parent = ancestors[ancestors.length - 2]

    return (
      (parent.type === 'ClassDeclaration' || parent.type === 'FunctionDeclaration') &&
      parent.id === node &&
      ancestors.length <= 3
    )
  },

  isVarDeclarationInGlobalScope(ancestors: Node[]) {
    const node = ancestors[ancestors.length - 1]
    const parent = ancestors[ancestors.length - 2]
    const grandParent = ancestors[ancestors.length - 3]
    const varBoundScopes = [
      'ClassDeclaration',
      'ClassExpression',
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
    ]

    return (
      parent.type === 'VariableDeclarator' &&
      parent.id === node &&
      grandParent.type === 'VariableDeclaration' &&
      grandParent.kind === 'var' &&
      ancestors.every(ancestor => {
        return !varBoundScopes.includes(ancestor.type)
      })
    )
  },

  isIife(ancestors: Node[]) {
    const parent = ancestors[ancestors.length - 2]

    return (
      parent.type === 'FunctionExpression' &&
      ancestors.some(ancestor => ancestor.type === 'ParenthesizedExpression')
    )
  },

  isFunctionExpressionId(ancestors: Node[]) {
    const node = ancestors[ancestors.length - 1]
    const parent = ancestors[ancestors.length - 2]

    return parent.type === 'FunctionExpression' && parent.id === node
  },

  isExportSpecifierAlias(ancestors: Node[]) {
    const node = ancestors[ancestors.length - 1]
    const parent = ancestors[ancestors.length - 2]

    return parent.type === 'ExportSpecifier' && parent.exported === node
  },

  isClassPropertyKey(ancestors: Node[]) {
    const node = ancestors[ancestors.length - 1]
    const parent = ancestors[ancestors.length - 2]

    return parent.type === 'PropertyDefinition' && parent.key === node
  },

  isMethodDefinitionKey(ancestors: Node[]) {
    const node = ancestors[ancestors.length - 1]
    const parent = ancestors[ancestors.length - 2]

    return parent.type === 'MethodDefinition' && parent.key === node
  },

  isMemberKey(ancestors: Node[]) {
    const node = ancestors[ancestors.length - 1]
    const parent = ancestors[ancestors.length - 2]

    return parent.type === 'MemberExpression' && parent.property === node
  },

  isPropertyKey(ancestors: Node[]) {
    const node = ancestors[ancestors.length - 1]
    const parent = ancestors[ancestors.length - 2]

    return parent.type === 'Property' && parent.key === node
  },
}

export { identifier, isIdentifierName }
