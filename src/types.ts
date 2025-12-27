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

export type ModuleOptions = {
  target: 'module' | 'commonjs'
  sourceType?: 'auto' | 'module' | 'commonjs'
  transformSyntax?: boolean
  liveBindings?: 'strict' | 'loose' | 'off'
  rewriteSpecifier?: RewriteSpecifier
  dirFilename?: 'inject' | 'preserve' | 'error'
  importMeta?: 'preserve' | 'shim' | 'error'
  requireSource?: 'builtin' | 'create-require'
  cjsDefault?: 'module-exports' | 'auto' | 'none'
  topLevelAwait?: 'error' | 'wrap' | 'preserve'
  out?: string
  inPlace?: boolean
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
