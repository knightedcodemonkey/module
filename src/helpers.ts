import type { Node } from 'oxc-parser'

const scopeNodes = [
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassDeclaration',
  'ClassExpression',
  'ClassBody',
  'BlockStatement',
]

const identifier = {
  isGlobalScope(ancestors: Node[]) {
    return ancestors.every(ancestor => {
      return !scopeNodes.includes(ancestor.type)
    })
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

export { scopeNodes, identifier }
