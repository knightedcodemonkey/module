import type { Node, Span } from 'oxc-parser'
export type ModuleOptions = {
  /* What module system to convert to. */
  type: 'module' | 'commonjs'
  /* Whether import/export and require/exports should be transformed. */
  importsExports?: boolean
  /* Whether to change specifier extensions to the assigned value. If omitted they are left alone. */
  specifier?: '.js' | '.mjs' | '.cjs' | '.ts' | '.mts' | '.cts'
  /* What filepath to write the transformed source to. */
  out?: string
}

type SpannedNode = Node & Span

export type ExportsMeta = {
  hasExportsBeenReassigned: boolean
  hasDefaultExportBeenReassigned: boolean
  hasDefaultExportBeenAssigned: boolean
  defaultExportValue: unknown
}

export type IdentMeta = {
  /*
    `var` can be redeclared in the same scope.
  */
  declare: SpannedNode[]
  read: SpannedNode[]
}

export type FormatterOptions = Omit<ModuleOptions, 'out'> &
  Required<Pick<ModuleOptions, 'type'>>
