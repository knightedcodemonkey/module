export type ModuleOptions = {
  /* What module system to convert to. */
  type?: 'module' | 'commonjs'
  /* Whether import/export and require/exports should be transformed. */
  moduleLoading?: boolean
  /* Whether to change specifier extensions to the assigned value. If omitted they are left alone. */
  specifiers?: '.js' | '.mjs' | '.cjs' | '.ts' | '.mts' | '.cts'
  /* What filepath to write the transformed source to. If omitted the transformed source is returned. */
  out?: string
}
