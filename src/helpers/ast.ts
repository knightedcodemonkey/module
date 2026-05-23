import type { Node } from 'oxc-parser'

import type { CjsExport } from '../types.js'

export type { Node }

type IdentifierNode = Extract<Node, { type: 'Identifier' }>
export type LiteralNode = Extract<Node, { type: 'Literal'; value?: unknown }>
type MemberExpressionNode = Extract<Node, { type: 'MemberExpression' }>
export type CallExpressionNode = Extract<Node, { type: 'CallExpression' }>
export type ProgramNode = Extract<Node, { type: 'Program'; body: Node[] }>
export type ModuleExportNameNode = Extract<Node, { type: 'Identifier' | 'Literal' }>
export type ImportDefaultSpecifierNode = Extract<Node, { type: 'ImportDefaultSpecifier' }>
export type ImportNamespaceSpecifierNode = Extract<
  Node,
  { type: 'ImportNamespaceSpecifier' }
>
export type ImportSpecifierNode = Extract<Node, { type: 'ImportSpecifier' }>
export type ExportsMap = Map<string, CjsExport> & { hasUnsupportedExportWrite?: boolean }

export const isAstNode = (value: unknown): value is Node => {
  return Boolean(value) && typeof value === 'object' && 'type' in (value as object)
}

export const isIdentifierNode = (
  node: Node | null | undefined,
): node is IdentifierNode => {
  return node?.type === 'Identifier'
}

export const isMemberExpressionNode = (
  node: Node | null | undefined,
): node is MemberExpressionNode => {
  return node?.type === 'MemberExpression'
}

export const isCallExpressionNode = (
  node: Node | null | undefined,
): node is CallExpressionNode => {
  return node?.type === 'CallExpression'
}

export const getModuleExportName = (
  name: ModuleExportNameNode | null | undefined,
): string | null => {
  if (!name) return null
  if (name.type === 'Identifier') return name.name
  if (name.type === 'Literal' && typeof name.value === 'string') return name.value
  return null
}
