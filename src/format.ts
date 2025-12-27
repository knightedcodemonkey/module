import type { ParseResult } from 'oxc-parser'
import type { FormatterOptions, ExportsMeta } from './types.js'
import MagicString from 'magic-string'

import { identifier } from '#formatters/identifier.js'
import { metaProperty } from '#formatters/metaProperty.js'
import { memberExpression } from '#formatters/memberExpression.js'
import { assignmentExpression } from '#formatters/assignmentExpression.js'
import { isValidUrl } from '#utils/url.js'
import { exportsRename, collectCjsExports } from '#utils/exports.js'
import { collectModuleIdentifiers } from '#utils/identifiers.js'
import { isIdentifierName } from '#helpers/identifier.js'
import { ancestorWalk } from '#walk'

const isValidIdent = (name: string) => /^[$A-Z_a-z][$\w]*$/.test(name)

const exportAssignment = (
  name: string,
  expr: string,
  live: 'strict' | 'loose' | 'off',
) => {
  const prop = isValidIdent(name) ? `.${name}` : `[${JSON.stringify(name)}]`
  if (live === 'strict') {
    const key = JSON.stringify(name)
    return `Object.defineProperty(exports, ${key}, { enumerable: true, get: () => ${expr} });`
  }
  return `exports${prop} = ${expr};`
}

const defaultInteropName = '__interopDefault'
const interopHelper = `const ${defaultInteropName} = mod => (mod && mod.__esModule ? mod.default : mod);\n`

const isRequireCallee = (callee: any, shadowed: Set<string>) => {
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

const isStaticRequire = (node: any, shadowed: Set<string>) =>
  node.type === 'CallExpression' &&
  isRequireCallee(node.callee, shadowed) &&
  node.arguments.length === 1 &&
  node.arguments[0].type === 'Literal' &&
  typeof node.arguments[0].value === 'string'

const isRequireCall = (node: any, shadowed: Set<string>) =>
  node.type === 'CallExpression' && isRequireCallee(node.callee, shadowed)

type RequireTransform = {
  start: number
  end: number
  code: string
}

const lowerCjsRequireToImports = (
  program: any,
  code: MagicString,
  shadowed: Set<string>,
) => {
  const transforms: RequireTransform[] = []
  const imports: string[] = []
  let nsIndex = 0
  let needsCreateRequire = false

  for (const stmt of program.body as any[]) {
    if (stmt.type === 'VariableDeclaration') {
      const decls = stmt.declarations
      const allStatic =
        decls.length > 0 &&
        decls.every((decl: any) => decl.init && isStaticRequire(decl.init, shadowed))

      if (allStatic) {
        for (const decl of decls) {
          const init = decl.init!
          const source = code.slice(init.arguments[0].start, init.arguments[0].end)

          if (decl.id.type === 'Identifier') {
            imports.push(`import * as ${decl.id.name} from ${source};\n`)
          } else if (decl.id.type === 'ObjectPattern') {
            const ns = `__cjsImport${nsIndex++}`
            const pattern = code.slice(decl.id.start, decl.id.end)
            imports.push(`import * as ${ns} from ${source};\n`)
            imports.push(`const ${pattern} = ${ns};\n`)
          } else {
            needsCreateRequire = true
          }
        }

        transforms.push({ start: stmt.start, end: stmt.end, code: ';\n' })
        continue
      }

      for (const decl of decls) {
        const init = decl.init
        if (init && isRequireCall(init, shadowed)) {
          needsCreateRequire = true
        }
      }
    }

    if (stmt.type === 'ExpressionStatement') {
      const expr = stmt.expression

      if (expr && isStaticRequire(expr, shadowed)) {
        const source = code.slice(expr.arguments[0].start, expr.arguments[0].end)
        imports.push(`import ${source};\n`)
        transforms.push({ start: stmt.start, end: stmt.end, code: ';\n' })
        continue
      }

      if (expr && isRequireCall(expr, shadowed)) {
        needsCreateRequire = true
      }
    }
  }

  return { transforms, imports, needsCreateRequire }
}

const isRequireMainMember = (node: any, shadowed: Set<string>) =>
  node &&
  node.type === 'MemberExpression' &&
  node.object.type === 'Identifier' &&
  node.object.name === 'require' &&
  !shadowed.has('require') &&
  node.property.type === 'Identifier' &&
  node.property.name === 'main'

const hasTopLevelAwait = (program: any) => {
  let found = false

  const walkNode = (node: any, inFunction: boolean) => {
    if (found) return

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

    const keys = Object.keys(node)
    for (const key of keys) {
      const value = (node as any)[key]
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

const lowerEsmToCjs = (
  program: any,
  code: MagicString,
  opts: FormatterOptions,
  containsTopLevelAwait: boolean,
) => {
  const live = opts.liveBindings ?? 'strict'
  const importTransforms: ImportTransform[] = []
  const exportTransforms: ExportTransform[] = []
  let needsInterop = false
  let importIndex = 0

  for (const node of program.body as any[]) {
    if (node.type === 'ImportDeclaration') {
      const srcLiteral = code.slice(node.source.start, node.source.end)
      const specifiers = node.specifiers ?? []
      const defaultSpec = specifiers.find((s: any) => s.type === 'ImportDefaultSpecifier')
      const namespaceSpec = specifiers.find(
        (s: any) => s.type === 'ImportNamespaceSpecifier',
      )
      const namedSpecs = specifiers.filter((s: any) => s.type === 'ImportSpecifier')

      // Side-effect import
      if (!specifiers.length) {
        importTransforms.push({
          start: node.start,
          end: node.end,
          code: `require(${srcLiteral});\n`,
          needsInterop: false,
        })
        continue
      }

      const modIdent = `__mod${importIndex++}`
      const lines: string[] = []

      lines.push(`const ${modIdent} = require(${srcLiteral});`)

      if (namespaceSpec) {
        lines.push(`const ${namespaceSpec.local.name} = ${modIdent};`)
      }

      if (defaultSpec) {
        let init = modIdent
        switch (opts.cjsDefault) {
          case 'module-exports':
            init = modIdent
            break
          case 'none':
            init = `${modIdent}.default`
            break
          case 'auto':
          default:
            init = `${defaultInteropName}(${modIdent})`
            needsInterop = true
            break
        }
        lines.push(`const ${defaultSpec.local.name} = ${init};`)
      }

      if (namedSpecs.length) {
        const pairs = namedSpecs.map((s: any) => {
          const imported = s.imported.name
          const local = s.local.name
          return imported === local ? imported : `${imported}: ${local}`
        })
        lines.push(`const { ${pairs.join(', ')} } = ${modIdent};`)
      }

      importTransforms.push({
        start: node.start,
        end: node.end,
        code: `${lines.join('\n')}\n`,
        needsInterop,
      })
    }

    if (node.type === 'ExportNamedDeclaration') {
      // Handle declaration exports
      if (node.declaration) {
        const decl = node.declaration
        const declSrc = code.slice(decl.start, decl.end)
        const exportedNames: string[] = []

        if (decl.type === 'VariableDeclaration') {
          for (const d of decl.declarations) {
            if (d.id.type === 'Identifier') {
              exportedNames.push(d.id.name)
            }
          }
        } else if ((decl as any).id?.type === 'Identifier') {
          exportedNames.push((decl as any).id.name)
        }

        const exportLines = exportedNames.map(name =>
          exportAssignment(name, name, live as any),
        )

        exportTransforms.push({
          start: node.start,
          end: node.end,
          code: `${declSrc}\n${exportLines.join('\n')}\n`,
        })
        continue
      }

      // Handle re-export or local specifiers
      if (node.specifiers?.length) {
        if (node.source) {
          const srcLiteral = code.slice(node.source.start, node.source.end)
          const modIdent = `__mod${importIndex++}`
          const lines = [`const ${modIdent} = require(${srcLiteral});`]

          for (const spec of node.specifiers) {
            if (spec.type !== 'ExportSpecifier') continue
            const exported = spec.exported.name
            const imported = spec.local.name

            let rhs = `${modIdent}.${imported}`
            if (imported === 'default') {
              rhs = `${defaultInteropName}(${modIdent})`
              needsInterop = true
            }

            lines.push(exportAssignment(exported, rhs, live as any))
          }

          exportTransforms.push({
            start: node.start,
            end: node.end,
            code: `${lines.join('\n')}\n`,
            needsInterop,
          })
        } else {
          const lines: string[] = []
          for (const spec of node.specifiers) {
            if (spec.type !== 'ExportSpecifier') continue
            const exported = spec.exported.name
            const local = spec.local.name
            lines.push(exportAssignment(exported, local, live as any))
          }
          exportTransforms.push({
            start: node.start,
            end: node.end,
            code: `${lines.join('\n')}\n`,
          })
        }
      }
    }

    if (node.type === 'ExportDefaultDeclaration') {
      const decl = node.declaration
      const useExportsObject = containsTopLevelAwait && opts.topLevelAwait !== 'error'
      if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
        if (decl.id?.name) {
          const declSrc = code.slice(decl.start, decl.end)
          const assign = useExportsObject
            ? `exports.default = ${decl.id.name};`
            : `module.exports = ${decl.id.name};`
          exportTransforms.push({
            start: node.start,
            end: node.end,
            code: `${declSrc}\n${assign}\n`,
          })
        } else {
          const declSrc = code.slice(decl.start, decl.end)
          const assign = useExportsObject
            ? `exports.default = ${declSrc};`
            : `module.exports = ${declSrc};`
          exportTransforms.push({
            start: node.start,
            end: node.end,
            code: `${assign}\n`,
          })
        }
      } else {
        const exprSrc = code.slice(decl.start, decl.end)
        const assign = useExportsObject
          ? `exports.default = ${exprSrc};`
          : `module.exports = ${exprSrc};`
        exportTransforms.push({
          start: node.start,
          end: node.end,
          code: `${assign}\n`,
        })
      }
    }

    if (node.type === 'ExportAllDeclaration') {
      const srcLiteral = code.slice(node.source.start, node.source.end)
      if ((node as any).exported) {
        const exported = (node as any).exported.name
        const modIdent = `__mod${importIndex++}`
        const lines = [
          `const ${modIdent} = require(${srcLiteral});`,
          exportAssignment(exported, modIdent, live as any),
        ]
        exportTransforms.push({
          start: node.start,
          end: node.end,
          code: `${lines.join('\n')}\n`,
        })
      } else {
        const modIdent = `__mod${importIndex++}`
        const lines = [`const ${modIdent} = require(${srcLiteral});`]
        const loop = `for (const k in ${modIdent}) {\n  if (k === 'default') continue;\n  if (!Object.prototype.hasOwnProperty.call(${modIdent}, k)) continue;\n  Object.defineProperty(exports, k, { enumerable: true, get: () => ${modIdent}[k] });\n}`
        lines.push(loop)
        exportTransforms.push({
          start: node.start,
          end: node.end,
          code: `${lines.join('\n')}\n`,
        })
      }
    }
  }

  return { importTransforms, exportTransforms, needsInterop }
}

type ImportTransform = {
  start: number
  end: number
  code: string
  needsInterop: boolean
}

type ExportTransform = {
  start: number
  end: number
  code: string
  needsInterop?: boolean
}

/**
 * Node added support for import.meta.main.
 * Added in: v24.2.0, v22.18.0
 * @see https://nodejs.org/api/esm.html#importmetamain
 */
const format = async (src: string, ast: ParseResult, opts: FormatterOptions) => {
  const code = new MagicString(src)
  const exportsMeta = {
    hasExportsBeenReassigned: false,
    defaultExportValue: undefined,
    hasDefaultExportBeenReassigned: false,
    hasDefaultExportBeenAssigned: false,
  } satisfies ExportsMeta
  const moduleIdentifiers = await collectModuleIdentifiers(ast.program)
  const shadowedBindings = new Set(
    [...moduleIdentifiers.entries()]
      .filter(([, meta]) => meta.declare.length > 0)
      .map(([name]) => name),
  )

  if (opts.target === 'module' && opts.transformSyntax) {
    if (shadowedBindings.has('module') || shadowedBindings.has('exports')) {
      throw new Error(
        'Cannot transform to ESM: module or exports is shadowed in module scope.',
      )
    }
  }

  const exportTable =
    opts.target === 'module' ? await collectCjsExports(ast.program) : null
  const shouldCheckTopLevelAwait = opts.target === 'commonjs' && opts.transformSyntax
  const containsTopLevelAwait = shouldCheckTopLevelAwait
    ? hasTopLevelAwait(ast.program)
    : false

  const shouldLowerCjs = opts.target === 'commonjs' && opts.transformSyntax
  const shouldRaiseEsm = opts.target === 'module' && opts.transformSyntax
  let hoistedImports: string[] = []
  let pendingRequireTransforms: RequireTransform[] = []
  let needsCreateRequire = false
  let pendingCjsTransforms: {
    transforms: Array<ImportTransform | ExportTransform>
    needsInterop: boolean
  } | null = null

  if (shouldLowerCjs && opts.topLevelAwait === 'error' && containsTopLevelAwait) {
    throw new Error(
      'Top-level await is not supported when targeting CommonJS (set topLevelAwait to "wrap" or "preserve" to override).',
    )
  }

  if (shouldRaiseEsm) {
    const {
      transforms,
      imports,
      needsCreateRequire: reqCreate,
    } = lowerCjsRequireToImports(ast.program, code, shadowedBindings)

    pendingRequireTransforms = transforms
    hoistedImports = imports
    needsCreateRequire = reqCreate
  }

  await ancestorWalk(ast.program, {
    async enter(node, ancestors) {
      const parent = ancestors[ancestors.length - 2] ?? null

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
            code.update(
              node.start,
              node.end,
              negate ? '!import.meta.main' : 'import.meta.main',
            )
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

        // Hoistable cases are handled separately and don't need createRequire.
        const topLevelExprStmt =
          parent?.type === 'ExpressionStatement' && grandparent?.type === 'Program'
        const topLevelVarDecl =
          parent?.type === 'VariableDeclarator' &&
          grandparent?.type === 'VariableDeclaration' &&
          greatGrandparent?.type === 'Program'
        const hoistableTopLevel = isStatic && (topLevelExprStmt || topLevelVarDecl)

        if (!isStatic || !hoistableTopLevel) {
          needsCreateRequire = true
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

      /**
       * Check for assignment to `import.meta.url`.
       */
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

      /**
       * Skip module scope CJS globals when they are object properties.
       * Ignoring `exports` here.
       */
      if (
        node.type === 'MemberExpression' &&
        node.property.type === 'Identifier' &&
        ['__filename', '__dirname'].includes(node.property.name)
      ) {
        this.skip()
      }

      /**
       * Check for bare `module.exports` expressions.
       */
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
          // Prevent parsing the `exports` identifier again.
          this.skip()
        }
      }

      /**
       * Format `module.exports` and `exports` assignments.
       */
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
        memberExpression(node, parent, code, opts, shadowedBindings)
      }

      if (isIdentifierName(node)) {
        identifier({
          node,
          ancestors,
          code,
          opts,
          meta: exportsMeta,
          shadowed: shadowedBindings,
        })
      }
    },
  })

  if (pendingRequireTransforms.length) {
    for (const t of pendingRequireTransforms) {
      code.overwrite(t.start, t.end, t.code)
    }
  }

  if (shouldLowerCjs) {
    const { importTransforms, exportTransforms, needsInterop } = lowerEsmToCjs(
      ast.program,
      code,
      opts,
      containsTopLevelAwait,
    )

    pendingCjsTransforms = {
      transforms: [...importTransforms, ...exportTransforms].sort(
        (a, b) => a.start - b.start,
      ),
      needsInterop,
    }
  }

  if (pendingCjsTransforms) {
    for (const t of pendingCjsTransforms.transforms) {
      code.overwrite(t.start, t.end, t.code)
    }

    if (pendingCjsTransforms.needsInterop) {
      code.prepend(`${interopHelper}exports.__esModule = true;\n`)
    }
  }

  if (opts.target === 'module' && opts.transformSyntax && exportTable) {
    const isValidExportName = (name: string) => /^[$A-Z_a-z][$\w]*$/.test(name)
    const asExportName = (name: string) =>
      isValidExportName(name) ? name : JSON.stringify(name)
    const accessProp = (name: string) =>
      isValidExportName(name)
        ? `${exportsRename}.${name}`
        : `${exportsRename}[${JSON.stringify(name)}]`
    const tempNameFor = (name: string) => {
      const sanitized = name.replace(/[^$\w]/g, '_') || 'value'
      const safe = /^[0-9]/.test(sanitized) ? `_${sanitized}` : sanitized
      return `__export_${safe}`
    }

    const lines: string[] = []

    const defaultEntry = exportTable.get('default')
    if (defaultEntry) {
      const def = defaultEntry.fromIdentifier ?? exportsRename
      lines.push(`export default ${def};`)
    }

    for (const [key, entry] of exportTable) {
      if (key === 'default') continue

      if (entry.fromIdentifier) {
        lines.push(`export { ${entry.fromIdentifier} as ${asExportName(key)} };`)
      } else {
        const temp = tempNameFor(key)
        lines.push(`const ${temp} = ${accessProp(key)};`)
        lines.push(`export { ${temp} as ${asExportName(key)} };`)
      }
    }

    if (lines.length) {
      code.append(`\n${lines.join('\n')}\n`)
    }
  }

  if (shouldRaiseEsm && opts.transformSyntax) {
    const importPrelude: string[] = []

    if (needsCreateRequire) {
      importPrelude.push('import { createRequire } from "node:module";\n')
    }

    if (hoistedImports.length) {
      importPrelude.push(...hoistedImports)
    }

    const requireInit = needsCreateRequire
      ? 'const require = createRequire(import.meta.url);\n'
      : ''

    const prelude = `${importPrelude.join('')}${
      importPrelude.length ? '\n' : ''
    }${requireInit}let ${exportsRename} = {};
void import.meta.filename;
`

    code.prepend(prelude)
  }

  if (opts.target === 'commonjs' && opts.transformSyntax && containsTopLevelAwait) {
    const body = code.toString()

    if (opts.topLevelAwait === 'wrap') {
      const tlaPromise = `const __tla = (async () => {\n${body}\nreturn module.exports;\n})();\n`
      const setPromise = `const __setTla = target => {\n  if (!target) return;\n  const type = typeof target;\n  if (type !== 'object' && type !== 'function') return;\n  target.__tla = __tla;\n};\n`
      const attach = `__setTla(module.exports);\n__tla.then(resolved => __setTla(resolved), err => { throw err; });\n`
      return `${tlaPromise}${setPromise}${attach}`
    }

    return `;(async () => {\n${body}\n})();\n`
  }

  return code.toString()
}

export { format }
