import { resolve } from 'node:path'
import { stat, readFile } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import MagicString from 'magic-string'
import type {
  ParserOptions,
  ParseResult,
  Node,
  StringLiteral,
  TemplateLiteral,
  BinaryExpression,
  NewExpression,
  ImportDeclaration,
  ExportNamedDeclaration,
  ExportAllDeclaration,
  TSImportType,
  ImportExpression,
  CallExpression,
} from 'oxc-parser'
import { parseSync } from 'oxc-parser'

import { walk } from '#walk'

type Spec = {
  type: 'StringLiteral' | 'TemplateLiteral' | 'BinaryExpression' | 'NewExpression'
  node: StringLiteral | TemplateLiteral | BinaryExpression | NewExpression
  parent:
    | CallExpression
    | ImportDeclaration
    | ExportNamedDeclaration
    | ExportAllDeclaration
    | ImportExpression
    | TSImportType
  start: number
  end: number
  value: string
}

type Callback = (spec: Spec) => string | void

type SpecifierApi = {
  update: (filename: string, callback: Callback) => Promise<string>
  updateSrc: (
    code: string,
    lang: ParserOptions['lang'],
    callback: Callback,
  ) => Promise<string>
}

const isStringLiteral = (node: Node): node is StringLiteral => {
  return node.type === 'Literal' && typeof node.value === 'string'
}

const isBinaryExpression = (node: Node): node is BinaryExpression => {
  // Distinguish between BinaryExpression and PrivateInExpression
  return node.type === 'BinaryExpression' && node.operator !== 'in'
}

const isCallExpression = (node: Node): node is CallExpression => {
  return node.type === 'CallExpression' && node.callee !== undefined
}

const formatSpecifiers = async (src: string, ast: ParseResult, cb: Callback) => {
  const code = new MagicString(src)
  const formatExpression = (expression: ImportExpression | CallExpression) => {
    const node = isCallExpression(expression)
      ? expression.arguments[0]
      : expression.source
    const { type } = node

    switch (type) {
      case 'Literal': {
        if (isStringLiteral(node)) {
          const { start, end, value } = node
          const updated = cb({
            type: 'StringLiteral',
            parent: expression,
            node,
            start,
            end,
            value,
          })

          if (typeof updated === 'string') {
            code.update(start + 1, end - 1, updated)
          }
        }
        break
      }
      case 'TemplateLiteral': {
        const { start, end } = node
        const value = src.slice(start + 1, end - 1)
        const updated = cb({
          type: 'TemplateLiteral',
          parent: expression,
          node,
          start,
          end,
          value,
        })

        if (typeof updated === 'string') {
          code.update(start + 1, end - 1, updated)
        }
        break
      }
      case 'BinaryExpression': {
        if (isBinaryExpression(node)) {
          const { start, end } = node
          const value = src.slice(start, end)
          const updated = cb({
            type: 'BinaryExpression',
            parent: expression,
            node,
            start,
            end,
            value,
          })

          if (typeof updated === 'string') {
            code.update(start, end, updated)
          }
        }
        break
      }
      case 'NewExpression': {
        if (node.callee.type === 'Identifier' && node.callee.name === 'String') {
          const { start, end } = node
          const value = src.slice(start, end)
          const updated = cb({
            type: 'NewExpression',
            parent: expression,
            node,
            start,
            end,
            value,
          })

          if (typeof updated === 'string') {
            code.update(start, end, updated)
          }
        }
        break
      }
    }
  }

  await walk(ast.program, {
    enter(node) {
      if (node.type === 'ExpressionStatement') {
        const { expression } = node

        if (expression.type === 'ImportExpression') {
          formatExpression(expression)
        }
      }

      if (node.type === 'CallExpression') {
        // Handle require(), require.resolve(), import.meta.resolve()
        if (
          (node.callee.type === 'Identifier' && node.callee.name === 'require') ||
          (node.callee.type === 'MemberExpression' &&
            node.callee.object.type === 'Identifier' &&
            node.callee.object.name === 'require' &&
            node.callee.property.type === 'Identifier' &&
            node.callee.property.name === 'resolve') ||
          (node.callee.type === 'MemberExpression' &&
            node.callee.object.type === 'MetaProperty' &&
            node.callee.object.meta.name === 'import' &&
            node.callee.property.type === 'Identifier' &&
            node.callee.property.name === 'resolve')
        ) {
          formatExpression(node)
        }
      }

      if (node.type === 'ArrowFunctionExpression') {
        const { body } = node

        if (body.type === 'ImportExpression') {
          formatExpression(body)
        }

        if (
          body.type === 'CallExpression' &&
          body.callee.type === 'Identifier' &&
          body.callee.name === 'require'
        ) {
          formatExpression(body)
        }
      }

      if (
        node.type === 'MemberExpression' &&
        node.object.type === 'ImportExpression' &&
        node.property.type === 'Identifier' &&
        node.property.name === 'then'
      ) {
        formatExpression(node.object)
      }

      if (node.type === 'TSImportType') {
        const source = (node as any).source

        if (source && isStringLiteral(source)) {
          const { start, end, value } = source
          const updated = cb({
            type: 'StringLiteral',
            node: source,
            parent: node,
            start,
            end,
            value,
          })

          if (typeof updated === 'string') {
            code.update(start + 1, end - 1, updated)
          }
        }
      }

      if (node.type === 'ImportDeclaration') {
        const { source } = node
        const { start, end, value } = source
        const updated = cb({
          type: 'StringLiteral',
          node: source,
          parent: node,
          start,
          end,
          value,
        })

        if (typeof updated === 'string') {
          code.update(start + 1, end - 1, updated)
        }
      }

      if (node.type === 'ExportNamedDeclaration' && node.source) {
        const { source } = node
        const { start, end, value } = source
        const updated = cb({
          type: 'StringLiteral',
          node: source,
          parent: node,
          start,
          end,
          value,
        })

        if (typeof updated === 'string') {
          code.update(start + 1, end - 1, updated)
        }
      }

      if (node.type === 'ExportAllDeclaration') {
        const { source } = node
        const { start, end, value } = source
        const updated = cb({
          type: 'StringLiteral',
          node: source,
          parent: node,
          start,
          end,
          value,
        })

        if (typeof updated === 'string') {
          code.update(start + 1, end - 1, updated)
        }
      }
    },
  })

  return code.toString()
}

const isValidFilename = async (filename: string) => {
  let stats: Stats

  try {
    stats = await stat(filename)
  } catch {
    return false
  }

  if (!stats.isFile()) {
    return false
  }

  return true
}

const specifier = {
  async update(path: string, callback: Callback) {
    const filename = resolve(path)
    const validated = await isValidFilename(filename)

    if (!validated) {
      throw new Error(`The provided path ${path} does not resolve to a file on disk.`)
    }

    const src = (await readFile(filename)).toString()
    const ast = parseSync(filename, src)

    return await formatSpecifiers(src, ast, callback)
  },

  async updateSrc(src: string, lang: ParserOptions['lang'], callback: Callback) {
    const filename =
      lang === 'ts'
        ? 'file.ts'
        : lang === 'tsx'
          ? 'file.tsx'
          : lang === 'js'
            ? 'file.js'
            : 'file.jsx'
    const ast = parseSync(filename, src)

    return await formatSpecifiers(src, ast, callback)
  },
} satisfies SpecifierApi

export { specifier }
export type { Spec, Callback }
