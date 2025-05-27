import type { Node } from 'oxc-parser'

const scopes = [
  'BlockStatement',
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassDeclaration',
  'ClassExpression',
  'ClassBody',
  'StaticBlock',
]

const scope = {
  isScope(node: Node) {
    return scopes.includes(node.type)
  },
}

export { scopes, scope }
