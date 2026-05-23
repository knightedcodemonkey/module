import MagicString from 'magic-string'

import { requireInteropName } from './interopHelpers.js'

import {
  isCallExpressionNode,
  type CallExpressionNode,
  type LiteralNode,
  type ProgramNode,
  type Node,
} from '../helpers/ast.js'

type RequireTransform = {
  start: number
  end: number
  code: string
}

const isRequireCallee = (callee: CallExpressionNode['callee'], shadowed: Set<string>) => {
  if (
    callee.type === 'Identifier' &&
    callee.name === 'require' &&
    !shadowed.has('require')
  ) {
    return true
  }

  if (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'module' &&
    !shadowed.has('module') &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'require'
  ) {
    return true
  }

  return false
}

const isStaticRequire = (node: Node, shadowed: Set<string>): node is CallExpressionNode =>
  node.type === 'CallExpression' &&
  isRequireCallee(node.callee, shadowed) &&
  node.arguments.length === 1 &&
  node.arguments[0].type === 'Literal' &&
  typeof (node.arguments[0] as LiteralNode).value === 'string'

const isRequireCall = (node: Node, shadowed: Set<string>): node is CallExpressionNode =>
  node.type === 'CallExpression' && isRequireCallee(node.callee, shadowed)

const lowerCjsRequireToImports = (
  program: ProgramNode,
  code: MagicString,
  shadowed: Set<string>,
) => {
  const transforms: RequireTransform[] = []
  const imports: string[] = []
  const hoisted: string[] = []
  let nsIndex = 0
  let needsCreateRequire = false
  let needsInteropHelper = false

  const isJsonSpecifier = (value: string) => {
    const base = value.split(/[?#]/)[0] ?? value
    return base.endsWith('.json')
  }

  for (const stmt of program.body) {
    if (stmt.type === 'VariableDeclaration') {
      const decls = stmt.declarations
      const allStatic =
        decls.length > 0 &&
        decls.every(
          decl => decl.init && isStaticRequire(decl.init as CallExpressionNode, shadowed),
        )

      if (allStatic) {
        for (const decl of decls) {
          const init = decl.init as CallExpressionNode | null
          if (!init || !isCallExpressionNode(init)) {
            needsCreateRequire = true
            continue
          }
          const arg = init.arguments[0]
          const source = code.slice(arg.start, arg.end)
          const value = (arg as LiteralNode).value
          const isJson = typeof value === 'string' && isJsonSpecifier(value)

          const ns = `__cjsImport${nsIndex++}`

          const jsonImport = isJson ? `${source} with { type: "json" }` : source

          if (decl.id.type === 'Identifier') {
            imports.push(
              isJson
                ? `import ${ns} from ${jsonImport};\n`
                : `import * as ${ns} from ${jsonImport};\n`,
            )
            hoisted.push(
              isJson
                ? `const ${decl.id.name} = ${ns};\n`
                : `const ${decl.id.name} = ${requireInteropName}(${ns});\n`,
            )
            needsInteropHelper ||= !isJson
          } else if (
            decl.id.type === 'ObjectPattern' ||
            decl.id.type === 'ArrayPattern'
          ) {
            const pattern = code.slice(decl.id.start, decl.id.end)
            imports.push(
              isJson
                ? `import ${ns} from ${jsonImport};\n`
                : `import * as ${ns} from ${jsonImport};\n`,
            )
            hoisted.push(
              isJson
                ? `const ${pattern} = ${ns};\n`
                : `const ${pattern} = ${requireInteropName}(${ns});\n`,
            )
            needsInteropHelper ||= !isJson
          } else {
            needsCreateRequire = true
          }
        }

        transforms.push({ start: stmt.start, end: stmt.end, code: ';\n' })
        continue
      }

      for (const decl of decls) {
        const init = decl.init
        if (init && isRequireCall(init as CallExpressionNode, shadowed)) {
          needsCreateRequire = true
        }
      }
    }

    if (stmt.type === 'ExpressionStatement') {
      const expr = stmt.expression

      if (expr && isStaticRequire(expr as CallExpressionNode, shadowed)) {
        if (!isCallExpressionNode(expr)) {
          needsCreateRequire = true
          continue
        }

        const arg = expr.arguments[0]
        const source = code.slice(arg.start, arg.end)
        const value = (arg as LiteralNode).value
        const isJson = typeof value === 'string' && isJsonSpecifier(value)

        const jsonImport = isJson ? `${source} with { type: "json" }` : source

        imports.push(`import ${jsonImport};\n`)
        transforms.push({ start: stmt.start, end: stmt.end, code: ';\n' })
        continue
      }

      if (expr && isRequireCall(expr as CallExpressionNode, shadowed)) {
        needsCreateRequire = true
      }
    }
  }

  return { transforms, imports, hoisted, needsCreateRequire, needsInteropHelper }
}

export { isRequireCall, isStaticRequire, lowerCjsRequireToImports, type RequireTransform }
