import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { resolve, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { mkdtemp, copyFile, readFile, rm, stat, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import { transform } from '../src/module.js'
import { runCli as runCliEntry } from '../src/cli.js'

const require = createRequire(import.meta.url)
const tsxImport = require.resolve('tsx/esm')
const tsxImportUrl = pathToFileURL(tsxImport).href
const projectRoot = resolve(import.meta.dirname, '..')
const cliEntry = resolve(projectRoot, 'src/cli.ts')
const fixture = resolve(projectRoot, 'test/fixtures/cli/input.cjs')
const fixtureRel = relative(projectRoot, fixture)
const pkgPath = resolve(projectRoot, 'package.json')
const tscBin = require.resolve('typescript/bin/tsc')

const runCli = (args: string[], input?: string, opts?: { cwd?: string }) =>
  spawnSync(process.execPath, ['--import', tsxImportUrl, cliEntry, ...args], {
    cwd: opts?.cwd ?? projectRoot,
    input,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  })

const runCodeInNode = async (
  code: string,
  opts: { type?: 'module' | 'commonjs'; cwd?: string; dir?: string } = {},
) => {
  const dir = opts.dir ?? (await mkdtemp(join(tmpdir(), 'module-cli-run-')))
  const ext = opts.type === 'module' ? '.mjs' : '.cjs'
  const filePath = join(dir, `out${ext}`)

  await writeFile(filePath, code, 'utf8')

  const { status, stderr } = spawnSync(process.execPath, [filePath], {
    cwd: opts.cwd ?? dir,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: undefined },
  })

  if (opts.dir) {
    await rm(filePath, { force: true })
  } else {
    await rm(dir, { recursive: true, force: true })
  }

  assert.equal(status, 0, stderr)
  return filePath
}

test('--help shows usage', async () => {
  const result = runCli(['--help'])
  assert.equal(result.status, 0)
  assert.match(result.stdout, /Usage: dub/)
  assert.equal(result.stderr, '')
})

test('--help emits color when TTY', async () => {
  let output = ''
  const stdout = {
    isTTY: true,
    write: (chunk: string | Uint8Array) => {
      output += chunk.toString()
      return true
    },
  }
  const stderr = { isTTY: true, write: () => true }

  const code = await runCliEntry({ argv: ['--help'], stdout, stderr })
  assert.equal(code, 0)
  assert.ok(output.includes('\u001b['))
})

test('--version prints package version', async () => {
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'))
  const result = runCli(['--version'])
  assert.equal(result.status, 0)
  assert.equal(result.stdout.trim(), pkg.version)
})

test('--list reports files without writing', async () => {
  const before = await readFile(fixture, 'utf8')
  const result = runCli(['--list', '--target', 'module', fixtureRel])
  assert.equal(result.status, 0)
  assert.ok(result.stdout.includes('input.cjs'))
  const after = await readFile(fixture, 'utf8')
  assert.equal(after, before)
})

test('--ignore excludes glob matches', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-ignore-'))
  const keep = join(temp, 'keep.cjs')
  const ignoredDir = join(temp, 'node_modules', 'pkg')
  const ignored = join(ignoredDir, 'index.cjs')
  await mkdir(ignoredDir, { recursive: true })
  await copyFile(fixture, keep)
  await copyFile(fixture, ignored)

  try {
    const result = runCli([
      '--list',
      '--target',
      'module',
      '--cwd',
      temp,
      '**/*.cjs',
      '--ignore',
      'node_modules/**',
    ])

    assert.equal(result.status, 0)
    assert.ok(result.stdout.includes('keep.cjs'))
    assert.ok(!result.stdout.includes('node_modules'))
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('-H error exits on dual package hazard', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-dual-hazard-'))
  const file = join(temp, 'entry.mjs')
  const pkgDir = join(temp, 'node_modules', 'x-core')

  await mkdir(pkgDir, { recursive: true })
  await writeFile(
    join(pkgDir, 'package.json'),
    JSON.stringify(
      {
        name: 'x-core',
        version: '1.0.0',
        exports: {
          '.': { import: './x-core.mjs', require: './x-core.cjs' },
          './module': './x-core.mjs',
        },
        main: './x-core.cjs',
      },
      null,
      2,
    ),
    'utf8',
  )
  await writeFile(
    file,
    [
      "import { X } from 'x-core/module'",
      "const core = require('x-core')",
      'console.log(core, X)',
      '',
    ].join('\n'),
    'utf8',
  )

  try {
    const result = runCli([
      '-H',
      'error',
      '--target',
      'commonjs',
      '--cwd',
      temp,
      'entry.mjs',
    ])

    assert.equal(result.status, 1)
    assert.match(result.stderr, /dual-package-mixed-specifiers/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('--dual-package-hazard-scope project aggregates across files', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-dual-hazard-project-'))
  const fileImport = join(temp, 'entry.mjs')
  const fileRequire = join(temp, 'entry.cjs')
  const pkgDir = join(temp, 'node_modules', 'x-core')

  await mkdir(pkgDir, { recursive: true })
  await writeFile(
    join(pkgDir, 'package.json'),
    JSON.stringify(
      {
        name: 'x-core',
        version: '1.0.0',
        exports: {
          '.': { import: './x-core.mjs', require: './x-core.cjs' },
        },
        main: './x-core.cjs',
      },
      null,
      2,
    ),
    'utf8',
  )
  await writeFile(fileImport, "import 'x-core'\n", 'utf8')
  await writeFile(fileRequire, "require('x-core')\n", 'utf8')

  try {
    const result = runCli([
      '-H',
      'error',
      '--dual-package-hazard-scope',
      'project',
      '--target',
      'commonjs',
      '--cwd',
      temp,
      '--dry-run',
      'entry.mjs',
      'entry.cjs',
    ])

    assert.equal(result.status, 1)
    assert.match(result.stderr, /dual-package-mixed-specifiers/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('--dual-package-hazard-scope project emits subpath hazard once', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-dual-hazard-subpath-'))
  const fileRoot = join(temp, 'root.mjs')
  const fileSub = join(temp, 'sub.mjs')
  const pkgDir = join(temp, 'node_modules', 'x-core')

  await mkdir(pkgDir, { recursive: true })
  await writeFile(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'x-core', version: '1.0.0', main: './index.cjs' }, null, 2),
    'utf8',
  )
  await writeFile(fileRoot, "import 'x-core'\n", 'utf8')
  await writeFile(fileSub, "import 'x-core/utils'\n", 'utf8')

  try {
    const result = runCli([
      '-H',
      'error',
      '--dual-package-hazard-scope',
      'project',
      '--target',
      'commonjs',
      '--cwd',
      temp,
      '--dry-run',
      'root.mjs',
      'sub.mjs',
    ])

    assert.equal(result.status, 1)
    const count = (result.stderr.match(/dual-package-subpath/g) || []).length
    assert.equal(count, 1)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('--dual-package-hazard-scope project surfaces conditional-exports', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-dual-hazard-conditional-'))
  const fileImport = join(temp, 'entry.mjs')
  const fileRequire = join(temp, 'entry.cjs')
  const pkgDir = join(temp, 'node_modules', 'x-core')

  await mkdir(pkgDir, { recursive: true })
  await writeFile(
    join(pkgDir, 'package.json'),
    JSON.stringify(
      {
        name: 'x-core',
        version: '1.2.3',
        exports: { '.': { import: './x-core.mjs', require: './x-core.cjs' } },
        main: './x-core.cjs',
      },
      null,
      2,
    ),
    'utf8',
  )
  await writeFile(fileImport, "import 'x-core'\n", 'utf8')
  await writeFile(fileRequire, "require('x-core')\n", 'utf8')

  try {
    const result = runCli([
      '--dual-package-hazard-scope',
      'project',
      '--target',
      'commonjs',
      '--cwd',
      temp,
      '--dry-run',
      'entry.mjs',
      'entry.cjs',
    ])

    assert.equal(result.status, 0)
    assert.match(result.stderr, /dual-package-mixed-specifiers/)
    assert.match(result.stderr, /dual-package-conditional-exports/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('--dual-package-hazard-scope project emits JSON diagnostics', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-dual-hazard-json-'))
  const fileImport = join(temp, 'entry.mjs')
  const fileRequire = join(temp, 'entry.cjs')
  const pkgDir = join(temp, 'node_modules', 'x-core')

  await mkdir(pkgDir, { recursive: true })
  await writeFile(
    join(pkgDir, 'package.json'),
    JSON.stringify(
      {
        name: 'x-core',
        version: '1.0.0',
        exports: { '.': { import: './x-core.mjs', require: './x-core.cjs' } },
        main: './x-core.cjs',
      },
      null,
      2,
    ),
    'utf8',
  )
  await writeFile(fileImport, "import 'x-core'\n", 'utf8')
  await writeFile(fileRequire, "require('x-core')\n", 'utf8')

  try {
    const result = runCli([
      '--dual-package-hazard-scope',
      'project',
      '--target',
      'commonjs',
      '--cwd',
      temp,
      '--dry-run',
      '--json',
      'entry.mjs',
      'entry.cjs',
    ])

    assert.equal(result.status, 0)
    const payload = JSON.parse(result.stdout)
    const codes = (payload.files ?? [])
      .flatMap((f: any) => f.diagnostics ?? [])
      .map((d: any) => d.code)
    assert.ok(codes.includes('dual-package-mixed-specifiers'))
    assert.ok(codes.includes('dual-package-conditional-exports'))
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('rewrites __dirname for ESM TS projects (NodeNext)', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-ts-node-next-'))
  const srcDir = join(temp, 'src')
  const file = join(srcDir, 'file.ts')

  await mkdir(srcDir, { recursive: true })
  await writeFile(
    join(temp, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2),
    'utf8',
  )
  await writeFile(
    join(temp, 'tsconfig.json'),
    JSON.stringify(
      { compilerOptions: { module: 'NodeNext' }, include: ['src'] },
      null,
      2,
    ),
    'utf8',
  )
  await writeFile(file, 'console.log(__dirname)\n', 'utf8')

  try {
    const result = runCli([
      '--target',
      'commonjs',
      '--transform-syntax',
      'globals-only',
      '--cwd',
      temp,
      'src/file.ts',
    ])

    assert.equal(result.status, 0)
    assert.ok(!result.stdout.includes('fileURLToPath'))
    assert.ok(result.stdout.includes('console.log(__dirname)'))
    await runCodeInNode(result.stdout, { type: 'commonjs' })
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('globals-only CJS output runs without ESM imports', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-globals-only-run-'))
  const file = join(temp, 'mod.cjs')

  await writeFile(file, 'console.log(__dirname)\n', 'utf8')

  try {
    const result = runCli([
      '--target',
      'commonjs',
      '--transform-syntax',
      'globals-only',
      file,
    ])

    assert.equal(result.status, 0)
    assert.ok(!result.stdout.includes('import '))
    await runCodeInNode(result.stdout, { type: 'commonjs' })
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

/*
 * End-to-end reproduction of the README pre-tsc flow: confirm TS fails on
 * import.meta/__filename under CJS, run globals-only rewrite in-place, then
 * confirm TS passes after the lexical globals swap.
 * @see https://github.com/microsoft/TypeScript/issues/58658
 */
test('globals-only pre-tsc flow matches README example', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-pre-tsc-'))
  const srcDir = join(temp, 'src')
  const file = join(srcDir, 'index.ts')

  await mkdir(srcDir, { recursive: true })
  await writeFile(
    join(temp, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          outDir: 'dist',
          strict: false,
          esModuleInterop: true,
          types: ['node'],
          typeRoots: [join(projectRoot, 'node_modules', '@types')],
        },
        include: ['src'],
      },
      null,
      2,
    ),
    'utf8',
  )
  await writeFile(
    file,
    [
      "import fs from 'node:fs'",
      'export const meta = import.meta.url',
      'export const size = fs.statSync(__filename).size',
      '',
    ].join('\n'),
    'utf8',
  )

  try {
    const before = spawnSync(process.execPath, [tscBin, '-p', temp], { encoding: 'utf8' })
    assert.notEqual(before.status, 0)

    const result = runCli(
      [
        '--target',
        'commonjs',
        '--transform-syntax',
        'globals-only',
        '--ignore',
        'node_modules/**',
        '--in-place',
        file,
      ],
      undefined,
      { cwd: temp },
    )

    assert.equal(result.status, 0)
    const transformed = await readFile(file, 'utf8')
    assert.ok(!transformed.includes('import.meta'))

    const after = spawnSync(process.execPath, [tscBin, '-p', temp], { encoding: 'utf8' })
    assert.equal(after.status, 0, after.stderr || after.stdout)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('--dry-run does not create outputs when out-dir provided', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-'))
  const outDir = join(temp, 'out')
  const result = runCli([
    '--dry-run',
    '--out-dir',
    outDir,
    '--target',
    'module',
    fixtureRel,
  ])
  assert.equal(result.status, 0)
  const outFile = join(outDir, relative(projectRoot, fixture))
  await assert.rejects(stat(outFile))
  await rm(temp, { recursive: true, force: true })
})

test('errors on conflicting out-dir and in-place', () => {
  const result = runCli(['--out-dir', 'dist', '--in-place', fixtureRel])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /Choose either --out-dir or --in-place/)
})

test('errors on multiple files without output destination', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-no-dest-'))
  const first = join(temp, 'a.cjs')
  const second = join(temp, 'b.cjs')
  await copyFile(fixture, first)
  await copyFile(fixture, second)

  try {
    const result = runCli(['--target', 'module', first, second])
    assert.equal(result.status, 2)
    assert.match(result.stderr, /Specify --out-dir or --in-place/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('errors on stdin combined with out-dir', () => {
  const result = runCli(['--out-dir', 'dist', '-'], 'console.log(1)')
  assert.equal(result.status, 2)
  assert.match(result.stderr, /Cannot combine stdin/)
})

test('errors when no inputs match', () => {
  const result = runCli(['does-not-exist-123.js'])
  assert.equal(result.status, 2)
  assert.match(result.stderr, /No input files were provided or matched/)
})

test('--json emits summary without intermixed output', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-json-'))
  const tempFile = join(temp, 'input.mjs')
  await writeFile(tempFile, 'console.log(1)\n', 'utf8')

  try {
    const result = runCli(['--target', 'module', '--json', '--dry-run', tempFile])

    assert.equal(result.status, 0)
    const parsed = JSON.parse(result.stdout)
    assert.equal(parsed.files[0].filePath, tempFile)
    assert.equal(parsed.summary.errors, 0)
    assert.ok(Number.isInteger(parsed.summary.warnings))
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('--summary prints work counts', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-summary-'))
  const tempFile = join(temp, 'input.cjs')
  await copyFile(fixture, tempFile)

  try {
    const result = runCli(['--target', 'module', '--summary', '--dry-run', tempFile])
    assert.equal(result.status, 0)
    assert.match(result.stdout, /Processed 1 file/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('--append-directory-index=false keeps trailing slash', () => {
  const source = "import mod from './lib/'\n"
  const result = runCli(
    [
      '--target',
      'module',
      '--stdin-filename',
      'input.mjs',
      '--append-directory-index=false',
    ],
    source,
  )

  assert.equal(result.status, 0)
  assert.match(result.stdout, /from '\.\/lib\/'/)
})

test('stdin errors bubble to exit code', () => {
  const result = runCli(
    ['--target', 'commonjs', '--stdin-filename', 'input.mjs'],
    'await 1',
  )

  assert.equal(result.status, 1)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /Top-level await is not supported/)
})

test('normalizes builtin specifiers to node: protocol', async () => {
  const source = "import fs from 'fs'\n"
  const result = runCli(['--target', 'module', '--stdin-filename', 'input.mjs'], source)
  assert.equal(result.status, 0)
  assert.match(result.stdout, /from 'node:fs'/)
  await runCodeInNode(result.stdout, { type: 'module' })
})

test('writes transformed file to stdout when allowed', async () => {
  const expected = await transform(fixture, { target: 'module' })
  const result = runCli(['--target', 'module', fixtureRel])

  assert.equal(result.status, 0)
  assert.equal(result.stdout, expected)
  await runCodeInNode(result.stdout, { type: 'module' })
})

test('appends directory index for trailing slash imports', () => {
  const source = "import mod from './lib/'\n"
  const result = runCli(['--target', 'module', '--stdin-filename', 'input.mjs'], source)
  assert.equal(result.status, 0)
  assert.match(result.stdout, /\.\/lib\/index\.js'/)
})

test('rewrites specifiers with --rewrite-specifier', () => {
  const source = "import x from './foo.ts'\n"
  const result = runCli(
    ['--target', 'module', '--stdin-filename', 'input.mjs', '--rewrite-specifier', '.js'],
    source,
  )
  assert.equal(result.status, 0)
  assert.match(result.stdout, /\.\/foo\.js'/)
})

test('--rewrite-template-literals guards interpolated templates', () => {
  const source = [
    "const side = 'alpha'",
    "import './file.ts'",
    'import(`./tmpl/${side}.ts`)',
    '',
  ].join('\n')

  const result = runCli(
    [
      '--target',
      'module',
      '--stdin-filename',
      'input.mjs',
      '--rewrite-specifier',
      '.js',
      '--rewrite-template-literals',
      'static-only',
    ],
    source,
  )

  assert.equal(result.status, 0)
  assert.ok(result.stdout.includes("import './file.js'"))
  assert.ok(result.stdout.includes('import(`./tmpl/${side}.ts`)'))
})

test('help example: out-dir mirror', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-'))
  const srcDir = join(temp, 'src')
  const input = join(srcDir, 'index.cjs')
  await mkdir(srcDir, { recursive: true })
  await copyFile(fixture, input)

  t.after(() => rm(temp, { recursive: true, force: true }))

  const result = runCli([
    '-t',
    'module',
    '--cwd',
    temp,
    'src/index.cjs',
    '--out-dir',
    'dist',
  ])

  assert.equal(result.status, 0)
  const outFile = join(temp, 'dist', 'src', 'index.cjs')
  const expected = await transform(input, { target: 'module', out: outFile })
  const written = await readFile(outFile, 'utf8')
  assert.equal(written, expected)
  await runCodeInNode(written, { type: 'module' })
})

test('--source-map=inline writes inline map to stdout', () => {
  const result = runCli(['--target', 'module', '--source-map=inline', fixtureRel])

  assert.equal(result.status, 0)
  const match =
    /sourceMappingURL=data:application\/json;charset=utf-8;base64,([^\n]+)/.exec(
      result.stdout,
    )
  assert.ok(match)
  const map = JSON.parse(Buffer.from(match?.[1] ?? '', 'base64').toString('utf8'))
  assert.equal(map.version, 3)
  assert.ok((map.sources ?? []).length > 0)
})

test('--source-map writes map files with out-dir', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-sourcemap-'))
  const input = join(temp, 'entry.cjs')
  await copyFile(fixture, input)

  t.after(() => rm(temp, { recursive: true, force: true }))

  const result = runCli(
    [
      '--target',
      'module',
      '--source-map',
      '--cwd',
      temp,
      '--out-dir',
      'dist',
      'entry.cjs',
    ],
    undefined,
    { cwd: temp },
  )

  assert.equal(result.status, 0)
  const outFile = join(temp, 'dist', 'entry.cjs')
  const mapFile = `${outFile}.map`
  const written = await readFile(outFile, 'utf8')
  assert.match(written, /sourceMappingURL=entry.cjs.map/)

  const map = JSON.parse(await readFile(mapFile, 'utf8'))
  assert.equal(map.file, 'entry.cjs.map')
  assert.ok((map.sources ?? []).some((s: string) => s.endsWith('entry.cjs')))
  assert.ok(String(map.mappings || '').length > 0)
})

test('--source-map=inline errors when targeting files', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-sourcemap-inline-file-'))
  const input = join(temp, 'entry.cjs')
  await copyFile(fixture, input)

  t.after(() => rm(temp, { recursive: true, force: true }))

  const result = runCli(
    [
      '--target',
      'module',
      '--source-map=inline',
      '--cwd',
      temp,
      '--out-dir',
      'dist',
      'entry.cjs',
    ],
    undefined,
    { cwd: temp },
  )

  assert.equal(result.status, 2)
  assert.match(
    result.stderr,
    /Inline source maps are only supported when writing to stdout/,
  )
})

test('--in-place rewrites files', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-'))
  const tempFile = join(temp, 'input.cjs')
  await copyFile(fixture, tempFile)

  t.after(() => rm(temp, { recursive: true, force: true }))

  const expected = await transform(tempFile, { target: 'module' })
  const result = runCli(['--in-place', '--target', 'module', tempFile])

  assert.equal(result.status, 0)
  const written = await readFile(tempFile, 'utf8')
  assert.equal(written, expected)
  await runCodeInNode(written, { type: 'module' })
})

test('help example: glob + in-place', async t => {
  const temp = await mkdtemp(join(tmpdir(), 'module-cli-'))
  const srcDir = join(temp, 'src', 'nested')
  const input = join(srcDir, 'example.mjs')
  await mkdir(srcDir, { recursive: true })
  await copyFile(resolve(projectRoot, 'test/fixtures/esmDefault.mjs'), input)
  await copyFile(
    resolve(projectRoot, 'test/fixtures/esmProvider.cjs'),
    join(srcDir, 'esmProvider.cjs'),
  )

  t.after(() => rm(temp, { recursive: true, force: true }))

  const result = runCli(['-t', 'commonjs', '--cwd', temp, 'src/**/*.mjs', '-p'])

  assert.equal(result.status, 0)
  const written = await readFile(input, 'utf8')
  const expected = await transform(input, { target: 'commonjs', inPlace: true })
  assert.equal(written, expected)
  await runCodeInNode(written, { type: 'commonjs', dir: srcDir, cwd: srcDir })
})

test('stdin/stdout transforms content', async () => {
  const source = await readFile(fixture, 'utf8')
  const expected = await transform(fixture, { target: 'module' })
  const result = runCli(['--target', 'module', '--stdin-filename', 'input.cjs'], source)

  assert.equal(result.status, 0)
  assert.equal(result.stdout, expected)
  await runCodeInNode(result.stdout, { type: 'module' })
})
