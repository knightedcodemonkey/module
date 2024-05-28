export type ModuleOptions = {
  /* What module system to convert to. */
  type?: 'module' | 'commonjs'
  /* Whether import/export and require/exports should be transformed. */
  modules?: boolean
  /* Whether to change specifier extensions to the assigned value. If omitted they are left alone. */
  specifier?: '.js' | '.mjs' | '.cjs' | '.ts' | '.mts' | '.cts'
  /* What filepath to write the transformed source to. */
  out?: string
}

export type FormatterOptions = Omit<ModuleOptions, 'out'> & Required<Pick<ModuleOptions, 'type'>>
