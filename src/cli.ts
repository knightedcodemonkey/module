#!/usr/bin/env node
import {
  stdin as defaultStdin,
  stdout as defaultStdout,
  stderr as defaultStderr,
} from 'node:process'
import { parseArgs } from 'node:util'
import { readFile, mkdir, writeFile, glob } from 'node:fs/promises'
import { dirname, resolve, relative, join, basename } from 'node:path'

import type { TemplateLiteral } from '@oxc-project/types'

import { transform, collectProjectDualPackageHazards } from './module.js'
import { parse } from './parse.js'
import { format } from './format.js'
import { specifier } from './specifier.js'
import { getLangFromExt } from './utils/lang.js'
import type { ModuleOptions, Diagnostic } from './types.js'
import { builtinSpecifiers } from './utils/builtinSpecifiers.js'

const defaultOptions: ModuleOptions = {
  target: 'commonjs',
  sourceType: 'auto',
  transformSyntax: true,
  liveBindings: 'strict',
  rewriteSpecifier: undefined,
  rewriteTemplateLiterals: 'allow',
  appendJsExtension: undefined,
  appendDirectoryIndex: 'index.js',
  dirFilename: 'inject',
  importMeta: 'shim',
  importMetaMain: 'shim',
  requireMainStrategy: 'import-meta-main',
  detectCircularRequires: 'off',
  detectDualPackageHazard: 'warn',
  dualPackageHazardScope: 'file',
  dualPackageHazardAllowlist: [],
  requireSource: 'builtin',
  nestedRequireStrategy: 'create-require',
  cjsDefault: 'auto',
  idiomaticExports: 'safe',
  importMetaPrelude: 'auto',
  topLevelAwait: 'error',
  sourceMap: false,
  cwd: undefined,
  out: undefined,
  inPlace: false,
}

type LogWriter = {
  stdout: StreamLike
  stderr: StreamLike
}

type StreamLike = {
  isTTY?: boolean
  write: (chunk: string | Uint8Array) => unknown
}

type CliOptions = {
  argv?: string[]
  stdin?: typeof defaultStdin
  stdout?: StreamLike
  stderr?: StreamLike
}

type IconKind = 'info' | 'warn' | 'error' | 'success'

type FileResult = {
  filePath: string
  changed: boolean
  diagnostics: Diagnostic[]
}

const icons: Record<IconKind, string> = {
  info: 'i',
  warn: '⚠',
  error: '✖',
  success: '✔',
}

const codes = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  green: '\u001b[32m',
  cyan: '\u001b[36m',
}

const colorize = (enabled: boolean) => {
  if (!enabled) {
    return {
      bold: (v: string) => v,
      dim: (v: string) => v,
      red: (v: string) => v,
      yellow: (v: string) => v,
      green: (v: string) => v,
      cyan: (v: string) => v,
    }
  }

  const wrap = (code: string) => (v: string) => `${code}${v}${codes.reset}`
  return {
    bold: wrap(codes.bold),
    dim: wrap(codes.dim),
    red: wrap(codes.red),
    yellow: wrap(codes.yellow),
    green: wrap(codes.green),
    cyan: wrap(codes.cyan),
  }
}

const collapseSpecifier = (value: string) => value.replace(/['"`+)\s]|new String\(/g, '')

const appendExtensionIfNeeded = (
  value: string,
  mode: NonNullable<ModuleOptions['appendJsExtension']>,
  dirIndex: string | false,
) => {
  if (mode === 'off') return

  const collapsed = collapseSpecifier(value)
  const isRelative = /^(?:\.\.?)\//.test(collapsed)
  if (!isRelative) return

  const base = collapsed.split(/[?#]/)[0]
  if (!base) return

  if (base.endsWith('/')) {
    if (!dirIndex) return
    return `${value}${dirIndex}`
  }

  const lastSegment = base.split('/').pop() ?? ''
  if (lastSegment.includes('.')) return

  return `${value}.js`
}

const rewriteSpecifierValue = (
  value: string,
  rewriteSpecifier: ModuleOptions['rewriteSpecifier'],
) => {
  if (!rewriteSpecifier) return

  if (typeof rewriteSpecifier === 'function') {
    return rewriteSpecifier(value) ?? undefined
  }

  const collapsed = collapseSpecifier(value)
  const relative = /^(?:\.\.?\/)/

  if (relative.test(collapsed)) {
    return value.replace(/(.+)\.(?:m|c)?(?:j|t)sx?([)'"]*)?$/, `$1${rewriteSpecifier}$2`)
  }
}

const normalizeBuiltinSpecifier = (value: string) => {
  const collapsed = collapseSpecifier(value)
  if (!collapsed) return

  const specPart = collapsed.split(/[?#]/)[0] ?? ''
  if (/^(?:\.\.?(?:\/)|\/)/.test(specPart)) return
  if (/^[a-zA-Z][a-zA-Z+.-]*:/.test(specPart) && !specPart.startsWith('node:')) return

  const bare = specPart.startsWith('node:') ? specPart.slice(5) : specPart
  const base = bare.split('/')[0] ?? ''

  if (!builtinSpecifiers.has(bare) && !builtinSpecifiers.has(base)) return
  if (specPart.startsWith('node:')) return

  const quote = /^['"`]/.exec(value)?.[0] ?? ''
  return quote ? `${quote}node:${value.slice(quote.length)}` : `node:${value}`
}

const optionsTable = [
  { long: 'target', short: 't', type: 'string', desc: 'Output format (module|commonjs)' },
  {
    long: 'transform-syntax',
    short: 'x',
    type: 'string',
    desc: 'Syntax transforms (true|false|globals-only)',
  },
  {
    long: 'rewrite-specifier',
    short: 'r',
    type: 'string',
    desc: 'Rewrite import specifiers (.js/.mjs/.cjs/.ts/.mts/.cts)',
  },
  {
    long: 'rewrite-template-literals',
    short: undefined,
    type: 'string',
    desc: 'Rewrite template literals (allow|static-only)',
  },
  {
    long: 'append-js-extension',
    short: 'j',
    type: 'string',
    desc: 'Append .js to relative imports (off|relative-only|all)',
  },
  {
    long: 'append-directory-index',
    short: 'i',
    type: 'string',
    desc: 'Append directory index (e.g. index.js) or false',
  },
  {
    long: 'detect-circular-requires',
    short: 'c',
    type: 'string',
    desc: 'Warn/error on circular require (off|warn|error)',
  },
  {
    long: 'detect-dual-package-hazard',
    short: 'H',
    type: 'string',
    desc: 'Warn/error on mixed import/require of dual packages (off|warn|error)',
  },
  {
    long: 'dual-package-hazard-scope',
    short: undefined,
    type: 'string',
    desc: 'Scope for dual package hazard detection (file|project)',
  },
  {
    long: 'dual-package-hazard-allowlist',
    short: undefined,
    type: 'string',
    desc: 'Comma-separated packages to ignore for dual package hazard checks',
  },
  {
    long: 'top-level-await',
    short: 'a',
    type: 'string',
    desc: 'TLA handling (error|wrap|preserve)',
  },
  {
    long: 'cjs-default',
    short: 'd',
    type: 'string',
    desc: 'Default interop (module-exports|auto|none)',
  },
  {
    long: 'idiomatic-exports',
    short: 'e',
    type: 'string',
    desc: 'Emit idiomatic exports when safe (off|safe|aggressive)',
  },
  {
    long: 'import-meta-prelude',
    short: 'm',
    type: 'string',
    desc: 'Emit import.meta prelude (off|auto|on)',
  },
  {
    long: 'source-map',
    short: undefined,
    type: 'boolean',
    desc: 'Emit a source map alongside transformed output (use --source-map=inline for stdout)',
  },
  {
    long: 'nested-require-strategy',
    short: 'n',
    type: 'string',
    desc: 'Rewrite nested require (create-require|dynamic-import)',
  },
  {
    long: 'require-main-strategy',
    short: 'R',
    type: 'string',
    desc: 'Detect main (import-meta-main|realpath)',
  },
  {
    long: 'live-bindings',
    short: 'l',
    type: 'string',
    desc: 'Live binding strategy (strict|loose|off)',
  },
  {
    long: 'out-dir',
    short: 'o',
    type: 'string',
    desc: 'Write outputs to a directory mirror',
  },
  { long: 'in-place', short: 'p', type: 'boolean', desc: 'Rewrite files in place' },
  {
    long: 'dry-run',
    short: 'y',
    type: 'boolean',
    desc: 'Do not write files; report planned changes',
  },
  { long: 'list', short: 'L', type: 'boolean', desc: 'List files that would change' },
  {
    long: 'summary',
    short: 's',
    type: 'boolean',
    desc: 'Print a summary of work performed',
  },
  {
    long: 'json',
    short: 'J',
    type: 'boolean',
    desc: 'Emit machine-readable JSON summary/diagnostics',
  },
  {
    long: 'cwd',
    short: 'C',
    type: 'string',
    desc: 'Working directory for resolving files/out paths',
  },
  {
    long: 'stdin-filename',
    short: 'f',
    type: 'string',
    desc: 'Virtual filename when reading from stdin',
  },
  {
    long: 'ignore',
    short: 'g',
    type: 'string',
    desc: 'Glob pattern(s) to ignore (repeatable)',
  },
  { long: 'help', short: 'h', type: 'boolean', desc: 'Show help' },
  { long: 'version', short: 'v', type: 'boolean', desc: 'Show version' },
]

type Parsed = ReturnType<typeof parseArgs>

type ParsedValues = Parsed['values']

const buildHelp = (enableColor: boolean) => {
  const c = colorize(enableColor)
  const maxFlagLength = Math.max(
    ...optionsTable.map(opt =>
      opt.short ? `  -${opt.short}, --${opt.long}`.length : `      --${opt.long}`.length,
    ),
  )
  const lines = [
    `${c.bold('Usage:')} dub [options] <files...>`,
    '',
    'Examples:',
    '  dub -t module src/index.cjs --out-dir dist',
    '  dub -t commonjs src/**/*.mjs -p',
    '  cat input.cjs | dub -t module --stdin-filename input.cjs',
    '',
    'Options:',
  ]

  for (const opt of optionsTable) {
    const flag = opt.short ? `  -${opt.short}, --${opt.long}` : `      --${opt.long}`
    const pad = ' '.repeat(Math.max(2, maxFlagLength - flag.length + 2))
    lines.push(`${c.bold(flag)}${pad}${opt.desc}`)
  }

  return `${lines.join('\n')}\n`
}
const parseEnum = <T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined => {
  if (value === undefined) return undefined
  return allowed.includes(value as T) ? (value as T) : undefined
}
const parseTransformSyntax = (
  value: string | undefined,
): ModuleOptions['transformSyntax'] => {
  if (value === undefined) return defaultOptions.transformSyntax
  if (value === 'globals-only') return 'globals-only'
  if (value === 'false') return false
  if (value === 'true') return true
  return defaultOptions.transformSyntax
}
const parseAppendDirectoryIndex = (value: string | undefined) => {
  if (value === undefined) return undefined
  if (value === 'false') return false
  return value
}
const parseAllowlist = (value: string | string[] | undefined) => {
  const values = value === undefined ? [] : Array.isArray(value) ? value : [value]

  return values
    .flatMap(entry => String(entry).split(','))
    .map(item => item.trim())
    .filter(Boolean)
}
const toModuleOptions = (values: ParsedValues): ModuleOptions => {
  const target =
    parseEnum(values.target as string | undefined, ['module', 'commonjs'] as const) ??
    defaultOptions.target
  const transformSyntax = parseTransformSyntax(
    values['transform-syntax'] as string | undefined,
  )
  const rewriteTemplateLiterals =
    parseEnum(
      values['rewrite-template-literals'] as string | undefined,
      ['allow', 'static-only'] as const,
    ) ?? defaultOptions.rewriteTemplateLiterals
  const appendJsExtension = parseEnum(
    values['append-js-extension'] as string | undefined,
    ['off', 'relative-only', 'all'] as const,
  )
  const appendDirectoryIndex = parseAppendDirectoryIndex(
    values['append-directory-index'] as string | undefined,
  )
  const dualPackageHazardAllowlist = parseAllowlist(
    values['dual-package-hazard-allowlist'] as string | string[] | undefined,
  )
  const opts: ModuleOptions = {
    ...defaultOptions,
    target,
    transformSyntax,
    rewriteSpecifier:
      (values['rewrite-specifier'] as ModuleOptions['rewriteSpecifier']) ?? undefined,
    rewriteTemplateLiterals,
    appendJsExtension: appendJsExtension,
    appendDirectoryIndex,
    detectCircularRequires:
      parseEnum(
        values['detect-circular-requires'] as string | undefined,
        ['off', 'warn', 'error'] as const,
      ) ?? defaultOptions.detectCircularRequires,
    detectDualPackageHazard:
      parseEnum(
        values['detect-dual-package-hazard'] as string | undefined,
        ['off', 'warn', 'error'] as const,
      ) ?? defaultOptions.detectDualPackageHazard,
    dualPackageHazardScope:
      parseEnum(
        values['dual-package-hazard-scope'] as string | undefined,
        ['file', 'project'] as const,
      ) ?? defaultOptions.dualPackageHazardScope,
    dualPackageHazardAllowlist,
    topLevelAwait:
      parseEnum(
        values['top-level-await'] as string | undefined,
        ['error', 'wrap', 'preserve'] as const,
      ) ?? defaultOptions.topLevelAwait,
    cjsDefault:
      parseEnum(
        values['cjs-default'] as string | undefined,
        ['module-exports', 'auto', 'none'] as const,
      ) ?? defaultOptions.cjsDefault,
    idiomaticExports:
      parseEnum(
        values['idiomatic-exports'] as string | undefined,
        ['off', 'safe', 'aggressive'] as const,
      ) ?? defaultOptions.idiomaticExports,
    importMetaPrelude:
      parseEnum(
        values['import-meta-prelude'] as string | undefined,
        ['off', 'auto', 'on'] as const,
      ) ?? defaultOptions.importMetaPrelude,
    nestedRequireStrategy:
      parseEnum(
        values['nested-require-strategy'] as string | undefined,
        ['create-require', 'dynamic-import'] as const,
      ) ?? defaultOptions.nestedRequireStrategy,
    requireMainStrategy:
      parseEnum(
        values['require-main-strategy'] as string | undefined,
        ['import-meta-main', 'realpath'] as const,
      ) ?? defaultOptions.requireMainStrategy,
    liveBindings:
      parseEnum(
        values['live-bindings'] as string | undefined,
        ['strict', 'loose', 'off'] as const,
      ) ?? defaultOptions.liveBindings,
    sourceMap: Boolean(values['source-map']),
    cwd: values.cwd ? resolve(String(values.cwd)) : defaultOptions.cwd,
  }

  return opts
}

const readStdin = async (stdin: typeof defaultStdin) => {
  const chunks: Buffer[] = []
  for await (const chunk of stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const normalizeSourceMapArgv = (argv: string[]) => {
  let sourceMapInline = false
  let invalidSourceMapValue: string | null = null
  const normalized: string[] = []
  const recordInvalid = (value: string) => {
    if (!invalidSourceMapValue) invalidSourceMapValue = value
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]

    if (arg === '--source-map') {
      const next = argv[i + 1]
      if (next === 'inline') {
        sourceMapInline = true
        normalized.push('--source-map')
        i += 1
        continue
      }
      if (next === 'true' || next === 'false') {
        normalized.push(`--source-map=${next}`)
        i += 1
        continue
      }
    }

    if (arg.startsWith('--source-map=')) {
      const value = arg.slice('--source-map='.length)
      if (value === 'inline') {
        sourceMapInline = true
        normalized.push('--source-map')
        continue
      }
      if (value === 'true' || value === 'false') {
        normalized.push(arg)
        continue
      }
      recordInvalid(value)
      continue
    }

    if (arg === '--source-map' && argv[i + 1] && argv[i + 1].startsWith('--')) {
      normalized.push('--source-map')
      continue
    }

    normalized.push(arg)
  }

  return { argv: normalized, sourceMapInline, invalidSourceMapValue }
}

const expandFiles = async (patterns: string[], cwd: string, ignore?: string[]) => {
  const files = new Set<string>()
  for (const pattern of patterns) {
    for await (const match of glob(pattern, {
      cwd,
      exclude: ignore,
      withFileTypes: true,
    })) {
      if (match.isDirectory()) continue
      files.add(resolve(match.parentPath, match.name))
    }
  }
  return [...files]
}

const makeLogger = (stdout: LogWriter['stdout'], stderr: LogWriter['stderr']) => {
  const enableColor = stdout.isTTY ?? stderr.isTTY ?? false
  const c = colorize(enableColor)

  const log = (
    kind: IconKind,
    message: string,
    stream: LogWriter['stdout'] | LogWriter['stderr'],
  ) => {
    const icon = icons[kind]
    const colored =
      kind === 'error'
        ? c.red(message)
        : kind === 'warn'
          ? c.yellow(message)
          : kind === 'success'
            ? c.green(message)
            : c.cyan(message)
    stream.write(`${icon} ${colored}\n`)
  }

  return {
    info: (msg: string) => log('info', msg, stdout),
    warn: (msg: string) => log('warn', msg, stderr),
    error: (msg: string) => log('error', msg, stderr),
    success: (msg: string) => log('success', msg, stdout),
    color: c,
  }
}

const applySpecifierUpdates = async (
  source: string,
  filename: string,
  opts: ModuleOptions,
  appendMode: NonNullable<ModuleOptions['appendJsExtension']>,
  dirIndex: string | false,
) => {
  if (!opts.rewriteSpecifier && appendMode === 'off' && !dirIndex) return source

  const lang = getLangFromExt(filename)
  const updated = await specifier.updateSrc(source, lang, spec => {
    if (
      spec.type === 'TemplateLiteral' &&
      opts.rewriteTemplateLiterals === 'static-only'
    ) {
      const node = spec.node as TemplateLiteral
      if (node.expressions.length > 0) return
    }
    const normalized = normalizeBuiltinSpecifier(spec.value)
    const rewritten = rewriteSpecifierValue(
      normalized ?? spec.value,
      opts.rewriteSpecifier,
    )
    const baseValue = rewritten ?? normalized ?? spec.value
    const appended = appendExtensionIfNeeded(baseValue, appendMode, dirIndex)
    return appended ?? rewritten ?? normalized ?? undefined
  })

  return updated
}

const transformVirtual = async (
  source: string,
  filename: string,
  opts: ModuleOptions,
) => {
  const ast = parse(filename, source)
  let output = await format(source, ast, { ...opts, filePath: filename })

  const appendMode: NonNullable<ModuleOptions['appendJsExtension']> =
    opts.appendJsExtension ?? (opts.target === 'module' ? 'relative-only' : 'off')
  const dirIndex =
    opts.appendDirectoryIndex === undefined ? 'index.js' : opts.appendDirectoryIndex

  output = await applySpecifierUpdates(output, filename, opts, appendMode, dirIndex)
  return output
}

const summarizeDiagnostics = (diags: Diagnostic[]) => {
  let warnings = 0
  let errors = 0
  for (const d of diags) {
    if (d.level === 'warning') warnings += 1
    if (d.level === 'error') errors += 1
  }
  return { warnings, errors }
}

const runFiles = async (
  files: string[],
  moduleOpts: ModuleOptions,
  io: LogWriter,
  flags: {
    dryRun: boolean
    list: boolean
    summary: boolean
    json: boolean
    outDir?: string
    inPlace: boolean
    allowStdout: boolean
    sourceMapInline: boolean
  },
) => {
  const results: FileResult[] = []
  const logger = makeLogger(io.stdout, io.stderr)
  const hazardScope = moduleOpts.dualPackageHazardScope ?? 'file'
  const hazardMode = moduleOpts.detectDualPackageHazard ?? 'warn'
  const projectHazards =
    hazardScope === 'project' && hazardMode !== 'off'
      ? await collectProjectDualPackageHazards(files, moduleOpts)
      : null

  for (const file of files) {
    const diagnostics: Diagnostic[] = []
    const original = await readFile(file, 'utf8')
    const outPath = flags.outDir
      ? join(flags.outDir, relative(moduleOpts.cwd ?? process.cwd(), file))
      : undefined
    const perFileOpts: ModuleOptions = {
      ...moduleOpts,
      diagnostics: diag => diagnostics.push(diag),
      out: undefined,
      inPlace: false,
      filePath: file,
      detectDualPackageHazard:
        hazardScope === 'project' ? 'off' : moduleOpts.detectDualPackageHazard,
    }

    const allowWrites = !flags.dryRun && !flags.list
    const writeInPlace = allowWrites && flags.inPlace
    let writeTarget: string | undefined

    if (allowWrites) {
      if (flags.inPlace) {
        perFileOpts.inPlace = true
      } else if (outPath) {
        writeTarget = outPath
        perFileOpts.out = outPath
        await mkdir(dirname(outPath), { recursive: true })
      } else if (!flags.allowStdout) {
        logger.error('Specify --out-dir or --in-place when transforming files')
        return { code: 2, results }
      }
    }

    if (moduleOpts.sourceMap && (writeTarget || writeInPlace)) {
      perFileOpts.out = undefined
      perFileOpts.inPlace = false
    }

    const transformed = await transform(file, perFileOpts)
    const output = typeof transformed === 'string' ? transformed : transformed.code
    const map = typeof transformed === 'string' ? null : transformed.map
    const changed = output !== original
    let finalOutput = output

    if (projectHazards) {
      const extras = projectHazards.get(file)
      if (extras?.length) diagnostics.push(...extras)
    }

    if (flags.list && changed) {
      logger.info(file)
    }

    if (map && flags.sourceMapInline && !writeTarget && !writeInPlace) {
      const mapUri = Buffer.from(JSON.stringify(map)).toString('base64')
      finalOutput = `${output.replace(/\/\/# sourceMappingURL=.*/g, '').trimEnd()}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${mapUri}\n`
    } else if (map && (writeTarget || writeInPlace)) {
      const target = writeTarget ?? file
      const mapPath = `${target}.map`
      const mapFile = basename(mapPath)
      map.file = basename(target)

      const updated = `${output.replace(/\/\/# sourceMappingURL=.*/g, '').trimEnd()}\n//# sourceMappingURL=${mapFile}\n`
      await writeFile(mapPath, JSON.stringify(map))

      if (writeTarget) {
        await writeFile(writeTarget, updated)
      } else if (writeInPlace) {
        await writeFile(file, updated)
      }
    }

    if (!flags.dryRun && !flags.list && !writeTarget && !writeInPlace) {
      io.stdout.write(finalOutput)
    }

    results.push({ filePath: file, changed, diagnostics })

    const counts = summarizeDiagnostics(diagnostics)
    if (!flags.json) {
      for (const diag of diagnostics) {
        const prefix = diag.level === 'error' ? logger.error : logger.warn
        const loc = diag.loc ? ` [${diag.loc.start}-${diag.loc.end}]` : ''
        prefix(`${diag.code}: ${diag.message}${loc}`)
      }
    }

    if (counts.errors > 0) {
      return { code: 1, results }
    }
  }

  if (flags.summary && !flags.json) {
    const changedCount = results.filter(r => r.changed).length
    logger.success(`Processed ${results.length} file(s); changed ${changedCount}`)
  }

  return { code: 0, results }
}

const runCli = async ({
  argv = process.argv.slice(2),
  stdin = defaultStdin,
  stdout = defaultStdout,
  stderr = defaultStderr,
}: CliOptions = {}) => {
  const logger = makeLogger(stdout, stderr)
  const {
    argv: normalizedArgv,
    sourceMapInline,
    invalidSourceMapValue,
  } = normalizeSourceMapArgv(argv)

  if (invalidSourceMapValue) {
    logger.error(`Invalid --source-map value: ${invalidSourceMapValue}`)
    return 2
  }

  const { values, positionals } = parseArgs({
    args: normalizedArgv,
    allowPositionals: true,
    options: Object.fromEntries(
      optionsTable.map(opt => [
        opt.long,
        {
          type: opt.type as 'string' | 'boolean',
          ...(opt.short ? { short: opt.short } : {}),
        },
      ]),
    ),
  })

  if (values.help) {
    stdout.write(buildHelp(stdout.isTTY ?? false))
    return 0
  }

  if (values.version) {
    const pkg = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    )
    stdout.write(`${pkg.version}\n`)
    return 0
  }

  const moduleOpts = toModuleOptions(values)
  if (sourceMapInline) moduleOpts.sourceMap = true
  const cwd = moduleOpts.cwd ?? process.cwd()
  const allowStdout = positionals.length <= 1
  const fromStdin = positionals.length === 0 || positionals.includes('-')
  const patterns = positionals.filter(p => p !== '-')
  const ignoreValues = values.ignore
  const ignore = ignoreValues
    ? (Array.isArray(ignoreValues) ? ignoreValues : [ignoreValues]).map(String)
    : undefined

  const outDir = values['out-dir'] ? resolve(cwd, String(values['out-dir'])) : undefined
  const inPlace = Boolean(values['in-place'])
  const dryRun = Boolean(values['dry-run'])
  const list = Boolean(values.list)
  const summary = Boolean(values.summary)
  const json = Boolean(values.json)

  if (sourceMapInline && (outDir || inPlace)) {
    logger.error('Inline source maps are only supported when writing to stdout')
    return 2
  }

  if (outDir && inPlace) {
    logger.error('Choose either --out-dir or --in-place, not both')
    return 2
  }

  if (fromStdin && (outDir || inPlace)) {
    logger.error(
      'Cannot combine stdin with --out-dir or --in-place; output goes to stdout',
    )
    return 2
  }

  const files = await expandFiles(patterns, cwd, ignore)

  if (!fromStdin && files.length === 0) {
    logger.error('No input files were provided or matched')
    return 2
  }

  const tasks: FileResult[] = []

  if (fromStdin) {
    const virtualName = (values['stdin-filename'] as string | undefined) ?? 'stdin.js'
    const source = await readStdin(stdin)
    const diagnostics: Diagnostic[] = []
    const output = await transformVirtual(source, virtualName, {
      ...moduleOpts,
      diagnostics: diag => diagnostics.push(diag),
      filePath: virtualName,
      cwd,
    })
    tasks.push({ filePath: virtualName, changed: true, diagnostics })
    stdout.write(output)

    if (!json) {
      for (const diag of diagnostics) {
        const prefix = diag.level === 'error' ? logger.error : logger.warn
        const loc = diag.loc ? ` [${diag.loc.start}-${diag.loc.end}]` : ''
        prefix(`${diag.code}: ${diag.message}${loc}`)
      }
    }

    const diagSummary = summarizeDiagnostics(diagnostics)
    if (diagSummary.errors > 0) return 1
  }

  if (files.length) {
    const result = await runFiles(
      files,
      { ...moduleOpts, cwd },
      { stdout, stderr },
      {
        dryRun,
        list,
        summary,
        json,
        outDir,
        inPlace,
        allowStdout,
        sourceMapInline,
      },
    )

    if (typeof result.code === 'number' && result.code !== 0) return result.code
    tasks.push(...result.results)
  }

  if (json) {
    const summaryDiag = summarizeDiagnostics(tasks.flatMap(t => t.diagnostics))
    stdout.write(`${JSON.stringify({ files: tasks, summary: summaryDiag }, null, 2)}\n`)
  }

  return 0
}

if (import.meta.main) {
  runCli().then(
    code => {
      if (code !== 0) process.exit(code)
    },
    err => {
      // eslint-disable-next-line no-console -- CLI surface
      console.error(err)
      process.exit(1)
    },
  )
}

export { runCli }
