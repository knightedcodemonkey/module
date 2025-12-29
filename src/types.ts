import type {
  Node,
  Span,
  IdentifierName,
  IdentifierReference,
  BindingIdentifier,
  LabelIdentifier,
  TSIndexSignatureName,
} from 'oxc-parser'

export type RewriteSpecifier =
  | '.js'
  | '.mjs'
  | '.cjs'
  | '.ts'
  | '.mts'
  | '.cts'
  | ((value: string) => string | null | undefined)

/** Options that control how modules are parsed, transformed, and emitted. */
export type ModuleOptions = {
  /** Output format to emit. */
  target: 'module' | 'commonjs'
  /** Explicit source type; auto infers from file extension. */
  sourceType?: 'auto' | 'module' | 'commonjs'
  /**
   * Enable syntax transforms beyond parsing.
   * - true: full CJS↔ESM lowering/raising
   * - 'globals-only': rewrite module-global differences (import.meta, __dirname/filename, require.main shims) while leaving import/export shapes untouched
   * - false/undefined: no syntax transforms
   */
  transformSyntax?: boolean | 'globals-only'
  /** How to emit live bindings for ESM exports. */
  liveBindings?: 'strict' | 'loose' | 'off'
  /** Rewrite import specifiers (e.g. add extensions). */
  rewriteSpecifier?: RewriteSpecifier
  /** Whether to append .js to relative imports. */
  appendJsExtension?: 'off' | 'relative-only' | 'all'
  /** Add directory index (e.g. /index.js) or disable. */
  appendDirectoryIndex?: string | false
  /** Precedence: rewriteSpecifier runs first; if it returns a string that wins. If it returns undefined or null, appenders apply. Bare specifiers are never modified by appenders. */
  /** Control __dirname/__filename handling (inject shims, preserve existing, or throw on use). */
  dirFilename?: 'inject' | 'preserve' | 'error'
  /** How to treat import.meta. */
  importMeta?: 'preserve' | 'shim' | 'error'
  /** Strategy for import.meta.main emulation. */
  importMetaMain?: 'shim' | 'warn' | 'error'
  /** Resolution strategy for detecting the main module. */
  requireMainStrategy?: 'import-meta-main' | 'realpath'
  /** Detect circular require usage level. */
  detectCircularRequires?: 'off' | 'warn' | 'error'
  /** Source used to provide require in ESM output. */
  requireSource?: 'builtin' | 'create-require'
  /** How to rewrite nested or non-hoistable require calls. */
  nestedRequireStrategy?: 'create-require' | 'dynamic-import'
  /** Default interop style for CommonJS default imports. */
  cjsDefault?: 'module-exports' | 'auto' | 'none'
  /** Emit idiomatic exports when raising CJS to ESM. */
  idiomaticExports?: 'off' | 'safe' | 'aggressive'
  /** Control whether a no-op import.meta prelude is emitted. */
  importMetaPrelude?: 'off' | 'auto' | 'on'
  /** Handling for top-level await constructs. */
  topLevelAwait?: 'error' | 'wrap' | 'preserve'
  /** Optional diagnostics sink for warnings/errors emitted during transform. */
  diagnostics?: (diag: Diagnostic) => void
  /** Optional source file path used for diagnostics context. */
  filePath?: string
  /** Base directory used to resolve relative `out` paths; defaults to process.cwd(). */
  cwd?: string
  /** Output directory or file path when writing. */
  out?: string
  /** Overwrite input files instead of writing to out. */
  inPlace?: boolean
}

export type Diagnostic = {
  level: 'warning' | 'error'
  code: string
  message: string
  filePath?: string
  loc?: { start: number; end: number }
}

export type SpannedNode = Node & Span

export type ExportsMeta = {
  hasExportsBeenReassigned: boolean
  hasDefaultExportBeenReassigned: boolean
  hasDefaultExportBeenAssigned: boolean
  defaultExportValue: unknown
}

export type CjsExport = {
  key: string
  writes: SpannedNode[]
  fromIdentifier?: string
  via: Set<'exports' | 'module.exports'>
  reassignments: SpannedNode[]
  hasGetter?: boolean
  hasNonTopLevelWrite?: boolean
}

export type IdentMeta = {
  /*
    `var` can be redeclared in the same scope.
  */
  declare: SpannedNode[]
  read: SpannedNode[]
}

export type Scope = {
  type: string
  name: string
  node: Node
  idents: Set<string>
}

export type FormatterOptions = Omit<ModuleOptions, 'out' | 'inPlace'>

export type Identifier =
  | IdentifierName
  | IdentifierReference
  | BindingIdentifier
  | LabelIdentifier
  | TSIndexSignatureName
