import { isAstNode, type Node, type ProgramNode } from './ast.js'

const hasTopLevelAwait = (program: ProgramNode) => {
  let found = false

  const walkNode = (node: unknown, inFunction: boolean) => {
    if (found) return
    if (!isAstNode(node)) return

    switch (node.type) {
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
      case 'ClassDeclaration':
      case 'ClassExpression':
        inFunction = true
        break
    }

    if (!inFunction && node.type === 'AwaitExpression') {
      found = true
      return
    }

    for (const value of Object.values(node)) {
      if (!value) continue

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object') {
            walkNode(item, inFunction)
            if (found) return
          }
        }
      } else if (value && typeof value === 'object') {
        walkNode(value, inFunction)
        if (found) return
      }
    }
  }

  walkNode(program, false)
  return found
}

const isAsyncContext = (ancestors: Node[]) => {
  for (let i = ancestors.length - 1; i >= 0; i -= 1) {
    const node = ancestors[i]
    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    ) {
      return !!node.async
    }

    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      return false
    }
  }

  return true
}

export { hasTopLevelAwait, isAsyncContext }
