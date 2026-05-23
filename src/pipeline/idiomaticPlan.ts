import type MagicString from 'magic-string'
import type { Node } from 'oxc-parser'

import {
  isAstNode,
  isCallExpressionNode,
  isIdentifierNode,
  isMemberExpressionNode,
} from '../helpers/ast.js'
import type { ExportsMap } from '../helpers/ast.js'
import type { FormatterOptions } from '../types.js'

const reservedExports = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
])

const isValidExportName = (name: string) =>
  /^[$A-Z_a-z][$\w]*$/.test(name) && !reservedExports.has(name)

const isAllowedRhs = (node: Node) =>
  node.type === 'Identifier' ||
  node.type === 'Literal' ||
  node.type === 'FunctionExpression' ||
  node.type === 'ArrowFunctionExpression' ||
  node.type === 'ClassExpression'

const expressionHasRequireCall = (node: Node, shadowed: Set<string>) => {
  let found = false

  const walkNode = (n: unknown) => {
    if (!isAstNode(n) || found) return

    if (
      isCallExpressionNode(n) &&
      isIdentifierNode(n.callee) &&
      n.callee.name === 'require' &&
      !shadowed.has('require')
    ) {
      found = true
      return
    }

    if (
      isCallExpressionNode(n) &&
      isMemberExpressionNode(n.callee) &&
      isIdentifierNode(n.callee.object) &&
      n.callee.object.name === 'require' &&
      !shadowed.has('require')
    ) {
      found = true
      return
    }

    const record = n as unknown as Record<string, unknown>
    const keys = Object.keys(record)
    for (const key of keys) {
      const value = record[key]
      if (!value) continue
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object') walkNode(item)
          if (found) return
        }
      } else if (value && typeof value === 'object') {
        walkNode(value)
        if (found) return
      }
    }
  }

  walkNode(node)
  return found
}

const rhsSourceFor = (code: MagicString, node: Node) =>
  code
    .slice(node.start, node.end)
    .replace(/\b__dirname\b/g, 'import.meta.dirname')
    .replace(/\b__filename\b/g, 'import.meta.filename')

const tryObjectLiteralExport = (
  rhs: Node,
  code: MagicString,
  requireShadowed: Set<string>,
  baseIsModuleExports: boolean,
  propName: string,
) => {
  if (!baseIsModuleExports || propName !== 'exports') return null
  if (rhs.type !== 'ObjectExpression') return null

  const exportsOut: string[] = []
  const seenKeys = new Set<string>()

  for (const prop of rhs.properties) {
    if (prop.type !== 'Property') return null
    if (prop.kind !== 'init') return null
    if (prop.computed || prop.method) return null

    if (prop.key.type !== 'Identifier') return null
    const key = prop.key.name

    if (key === '__proto__' || key === 'prototype') return null
    if (!isValidExportName(key)) return null
    if (seenKeys.has(key)) return null

    const value =
      prop.value.type === 'Identifier' && prop.shorthand ? prop.key : prop.value

    if (!isAllowedRhs(value)) return null
    if (expressionHasRequireCall(value, requireShadowed)) return null

    const rhsSrc = rhsSourceFor(code, value)
    if (value.type === 'Identifier' && value.name === key) {
      exportsOut.push(`export { ${key} };`)
    } else if (value.type === 'Identifier') {
      exportsOut.push(`export { ${rhsSrc} as ${key} };`)
    } else {
      exportsOut.push(`export const ${key} = ${rhsSrc};`)
    }

    seenKeys.add(key)
  }

  exportsOut.push(`export default ${rhsSourceFor(code, rhs)};`)

  return { exportsOut, seenKeys }
}

type Replacement = { start: number; end: number }
type IdiomaticPlan = { replacements: Replacement[]; exports: string[] }
type IdiomaticPlanResult =
  | { ok: true; plan: IdiomaticPlan }
  | { ok: false; reason: string }

type BuildIdiomaticPlanParams = {
  src: string
  code: MagicString
  exportTable: ExportsMap
  shadowedBindings: Set<string>
  idiomaticMode: FormatterOptions['idiomaticExports']
}

const buildIdiomaticPlan = ({
  src,
  code,
  exportTable,
  shadowedBindings,
  idiomaticMode,
}: BuildIdiomaticPlanParams): IdiomaticPlanResult => {
  if (idiomaticMode === 'off') return { ok: false, reason: 'disabled' }

  const entries = [...exportTable.values()]
  if (!entries.length) return { ok: false, reason: 'no-exports' }

  if (exportTable.hasUnsupportedExportWrite) {
    return { ok: false, reason: 'unsupported-left' }
  }

  const viaSet = new Set<string>()
  for (const entry of entries) {
    entry.via.forEach(v => viaSet.add(v))
    if (entry.hasGetter) return { ok: false, reason: 'getter-present' }
    if (entry.reassignments.length) return { ok: false, reason: 'reassignment' }
    if (entry.hasNonTopLevelWrite) return { ok: false, reason: 'non-top-level' }
    if (entry.writes.length !== 1) return { ok: false, reason: 'multiple-writes' }
    if (entry.key !== 'default' && !isValidExportName(entry.key))
      return { ok: false, reason: 'non-identifier-key' }
  }

  if (viaSet.size > 1) return { ok: false, reason: 'mixed-exports' }

  const replacements: Replacement[] = []
  const exportsOut: string[] = []
  const seen = new Set<string>()

  const requireShadowed = shadowedBindings

  for (const entry of entries) {
    const write = entry.writes[0]
    if (write.type !== 'AssignmentExpression') {
      return { ok: false, reason: 'unsupported-write-kind' }
    }

    const left = write.left
    if (
      left.type !== 'MemberExpression' ||
      left.computed ||
      left.property.type !== 'Identifier'
    ) {
      return { ok: false, reason: 'unsupported-left' }
    }

    const base = left.object
    const propName = left.property.name
    const baseIsExports = base.type === 'Identifier' && base.name === 'exports'
    const baseIsModuleExports =
      (base.type === 'Identifier' && base.name === 'module' && propName === 'exports') ||
      (base.type === 'MemberExpression' &&
        base.object.type === 'Identifier' &&
        base.object.name === 'module' &&
        base.property.type === 'Identifier' &&
        base.property.name === 'exports')

    if (!baseIsExports && !baseIsModuleExports) {
      return { ok: false, reason: 'unsupported-base' }
    }

    const rhs = write.right
    const objectLiteralPlan = tryObjectLiteralExport(
      rhs,
      code,
      requireShadowed,
      baseIsModuleExports,
      propName,
    )
    if (!objectLiteralPlan) {
      if (!isAllowedRhs(rhs)) return { ok: false, reason: 'unsupported-rhs' }
      if (expressionHasRequireCall(rhs, requireShadowed)) {
        return { ok: false, reason: 'rhs-require' }
      }
    }

    const rhsSrc = rhsSourceFor(code, rhs)
    if (propName === 'exports' && baseIsModuleExports) {
      if (objectLiteralPlan) {
        for (const line of objectLiteralPlan.exportsOut) {
          exportsOut.push(line)
        }
        objectLiteralPlan.seenKeys.forEach(k => seen.add(k))
      } else {
        if (seen.has('default')) return { ok: false, reason: 'duplicate-default' }
        seen.add('default')
        exportsOut.push(`export default ${rhsSrc};`)
      }
    } else {
      if (seen.has(propName)) return { ok: false, reason: 'duplicate-key' }
      seen.add(propName)
      if (rhs.type === 'Identifier') {
        const rhsId = rhsSourceFor(code, rhs)
        const rhsName = rhs.name
        if (rhsId === rhsName && rhsName === propName) {
          exportsOut.push(`export { ${propName} };`)
        } else if (rhsId === rhsName) {
          exportsOut.push(`export { ${rhsId} as ${propName} };`)
        } else {
          exportsOut.push(`export const ${propName} = ${rhsId};`)
        }
      } else {
        exportsOut.push(`export const ${propName} = ${rhsSrc};`)
      }
    }

    let end = write.end
    while (end < src.length && (src[end] === ' ' || src[end] === '\t')) end++
    if (end < src.length && src[end] === ';') end++
    replacements.push({ start: write.start, end })
  }

  if (!seen.size) return { ok: false, reason: 'no-seen' }

  return { ok: true, plan: { replacements, exports: exportsOut } }
}

export { buildIdiomaticPlan }
