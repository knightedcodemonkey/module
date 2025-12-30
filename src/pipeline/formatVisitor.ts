import type MagicString from 'magic-string'

import type { Node, LiteralNode, CallExpressionNode } from '../helpers/ast.js'
import type { IdentifierName } from 'oxc-parser'
import type { WarnOnce } from './exportBagToEsm.js'
import type { FormatterOptions, ExportsMeta } from '../types.js'
import { exportsRename } from '../utils/exports.js'

type AssignmentExpressionFn =
  (typeof import('../formatters/assignmentExpression.js'))['assignmentExpression']
type IdentifierFn = (typeof import('../formatters/identifier.js'))['identifier']
type MemberExpressionFn =
  (typeof import('../formatters/memberExpression.js'))['memberExpression']
type MetaPropertyFn = (typeof import('../formatters/metaProperty.js'))['metaProperty']

// Narrow typing for ancestorWalk's `this`
type VisitorThis = { skip(): void }

type FormatWalkState = {
  importMetaRef: boolean
  requireMainNeedsRealpath: boolean
  needsCreateRequire: boolean
  needsRequireResolveHelper: boolean
}

type FormatWalkContext = {
  code: MagicString
  opts: FormatterOptions
  warnOnce: WarnOnce
  shadowedBindings: Set<string>
  requireMainStrategy: FormatterOptions['requireMainStrategy']
  nestedRequireStrategy: FormatterOptions['nestedRequireStrategy']
  shouldRaiseEsm: boolean
  fullTransform: boolean
  useExportsBag: boolean
  exportsMeta: ExportsMeta
  isRequireMainMember: (node: Node, shadowed: Set<string>) => boolean
  isRequireCall: (node: Node, shadowed: Set<string>) => node is CallExpressionNode
  isStaticRequire: (node: Node, shadowed: Set<string>) => node is CallExpressionNode
  isAsyncContext: (ancestors: Node[]) => boolean
  isValidUrl: (value: string) => boolean
  isIdentifierName: (node: Node) => node is IdentifierName
  assignmentExpression: AssignmentExpressionFn
  metaProperty: MetaPropertyFn
  memberExpression: MemberExpressionFn
  identifier: IdentifierFn
}

const buildFormatVisitor = (ctx: FormatWalkContext, state: FormatWalkState) => {
  return async function enter(this: VisitorThis, node: Node, ancestors: Node[]) {
    const parent = ancestors[ancestors.length - 2] ?? null
    const {
      code,
      opts,
      warnOnce,
      shadowedBindings,
      requireMainStrategy,
      nestedRequireStrategy,
      shouldRaiseEsm,
      fullTransform,
      useExportsBag,
      exportsMeta,
      isRequireMainMember,
      isRequireCall,
      isStaticRequire,
      isAsyncContext,
      isValidUrl,
      isIdentifierName,
      assignmentExpression,
      metaProperty,
      memberExpression,
      identifier,
    } = ctx

    if (shouldRaiseEsm && node.type === 'ReturnStatement' && parent?.type === 'Program') {
      warnOnce(
        'top-level-return',
        'Top-level return is not allowed in ESM; the transformed module will fail to parse.',
        { start: node.start, end: node.end },
      )
    }

    if (shouldRaiseEsm && node.type === 'BinaryExpression') {
      const op = node.operator
      const isEquality = op === '===' || op === '==' || op === '!==' || op === '!='

      if (isEquality) {
        const leftMain = isRequireMainMember(node.left, shadowedBindings)
        const rightMain = isRequireMainMember(node.right, shadowedBindings)
        const leftModule =
          node.left.type === 'Identifier' &&
          node.left.name === 'module' &&
          !shadowedBindings.has('module')
        const rightModule =
          node.right.type === 'Identifier' &&
          node.right.name === 'module' &&
          !shadowedBindings.has('module')

        if ((leftMain && rightModule) || (rightMain && leftModule)) {
          const negate = op === '!==' || op === '!='
          const mainExpr =
            requireMainStrategy === 'import-meta-main'
              ? 'import.meta.main'
              : 'import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href'
          if (requireMainStrategy === 'realpath') {
            state.requireMainNeedsRealpath = true
            state.importMetaRef = true
          }
          if (requireMainStrategy === 'import-meta-main') {
            state.importMetaRef = true
          }
          code.update(node.start, node.end, negate ? `!(${mainExpr})` : mainExpr)
          return
        }
      }
    }

    if (shouldRaiseEsm && node.type === 'WithStatement') {
      throw new Error('Cannot transform to ESM: with statements are not supported.')
    }

    if (
      shouldRaiseEsm &&
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'eval' &&
      !shadowedBindings.has('eval')
    ) {
      throw new Error('Cannot transform to ESM: eval is not supported.')
    }

    if (
      shouldRaiseEsm &&
      node.type === 'CallExpression' &&
      isRequireCall(node, shadowedBindings)
    ) {
      const isStatic = isStaticRequire(node, shadowedBindings)
      const parent = ancestors[ancestors.length - 2] ?? null
      const grandparent = ancestors[ancestors.length - 3] ?? null
      const greatGrandparent = ancestors[ancestors.length - 4] ?? null

      const topLevelExprStmt =
        parent?.type === 'ExpressionStatement' && grandparent?.type === 'Program'
      const topLevelVarDecl =
        parent?.type === 'VariableDeclarator' &&
        grandparent?.type === 'VariableDeclaration' &&
        greatGrandparent?.type === 'Program'
      const hoistableTopLevel = isStatic && (topLevelExprStmt || topLevelVarDecl)

      if (!isStatic || !hoistableTopLevel) {
        if (nestedRequireStrategy === 'dynamic-import') {
          const asyncCapable = isAsyncContext(ancestors)

          if (asyncCapable) {
            const arg = node.arguments[0]
            const argSrc = arg ? code.slice(arg.start, arg.end) : 'undefined'
            const literalVal = (arg as LiteralNode | undefined)?.value
            const isJson =
              arg?.type === 'Literal' &&
              typeof literalVal === 'string' &&
              (literalVal.split(/[?#]/)[0] ?? literalVal).endsWith('.json')
            const importTarget = isJson ? `${argSrc} with { type: "json" }` : argSrc

            code.update(node.start, node.end, `(await import(${importTarget}))`)
            return
          }
        }

        state.needsCreateRequire = true
      }
    }

    if (
      node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    ) {
      const skipped = ['__filename', '__dirname']
      const skippedParams = node.params.filter(
        param => param.type === 'Identifier' && skipped.includes(param.name),
      )
      const skippedFuncIdentifier =
        node.id?.type === 'Identifier' && skipped.includes(node.id.name)

      if (skippedParams.length || skippedFuncIdentifier) {
        this.skip()
      }
    }

    if (
      node.type === 'AssignmentExpression' &&
      node.left.type === 'MemberExpression' &&
      node.left.object.type === 'MetaProperty' &&
      node.left.property.type === 'Identifier' &&
      node.left.property.name === 'url'
    ) {
      if (node.right.type === 'Literal' && typeof node.right.value === 'string') {
        if (!isValidUrl(node.right.value)) {
          const rhs = code.snip(node.right.start, node.right.end).toString()
          const assignment = code.snip(node.start, node.end).toString()

          code.update(
            node.start,
            node.end,
            `/* Invalid assignment: ${rhs} is not a URL. ${assignment} */`,
          )
          this.skip()
        }
      }
    }

    if (
      node.type === 'MemberExpression' &&
      node.property.type === 'Identifier' &&
      ['__filename', '__dirname'].includes(node.property.name)
    ) {
      this.skip()
    }

    if (
      node.type === 'MemberExpression' &&
      node.object.type === 'Identifier' &&
      node.object.name === 'module' &&
      node.property.type === 'Identifier' &&
      node.property.name === 'exports' &&
      parent?.type === 'ExpressionStatement'
    ) {
      if (opts.target === 'module') {
        code.update(node.start, node.end, ';')
        this.skip()
      }
    }

    if (node.type === 'AssignmentExpression') {
      await assignmentExpression({
        node,
        parent,
        code,
        opts,
        meta: exportsMeta,
      })
    }

    if (node.type === 'MetaProperty') {
      metaProperty(node, parent, code, opts)
    }

    if (node.type === 'MemberExpression') {
      memberExpression(
        node,
        parent,
        code,
        opts,
        shadowedBindings,
        {
          onRequireResolve: () => {
            if (shouldRaiseEsm) state.needsRequireResolveHelper = true
          },
          requireResolveName: '__requireResolve',
          onDiagnostic: (
            codeId: string,
            message: string,
            loc?: { start: number; end: number },
          ) => {
            if (shouldRaiseEsm) warnOnce(codeId, message, loc)
          },
        },
        useExportsBag,
        fullTransform,
      )
    }

    if (shouldRaiseEsm && node.type === 'ThisExpression') {
      const bindsThis = (ancestor: Node) => {
        return (
          ancestor.type === 'FunctionDeclaration' ||
          ancestor.type === 'FunctionExpression' ||
          ancestor.type === 'ClassDeclaration' ||
          ancestor.type === 'ClassExpression'
        )
      }

      const bindingAncestor = ancestors.find(ancestor => bindsThis(ancestor))
      const isTopLevel = !bindingAncestor

      if (isTopLevel) {
        code.update(node.start, node.end, exportsRename)
        return
      }
    }

    if (isIdentifierName(node)) {
      if (shouldRaiseEsm && (node.name === '__dirname' || node.name === '__filename')) {
        state.importMetaRef = true
      }

      identifier({
        node,
        ancestors,
        code,
        opts,
        meta: exportsMeta,
        shadowed: shadowedBindings,
        useExportsBag,
      })
    }
  }
}

export { buildFormatVisitor, type FormatWalkState }
