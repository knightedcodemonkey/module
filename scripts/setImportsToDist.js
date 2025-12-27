import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const pkgPath = resolve('package.json')
const distImports = {
  '#parse': './dist/parse.js',
  '#format': './dist/format.js',
  '#utils/*.js': './dist/utils/*.js',
  '#walk': './dist/walk.js',
  '#helpers/*.js': './dist/helpers/*.js',
  '#formatters/*.js': './dist/formatters/*.js',
}

const main = async () => {
  try {
    const raw = await readFile(pkgPath, 'utf8')
    const pkg = JSON.parse(raw)
    pkg.imports ||= {}

    let changed = false
    for (const [key, value] of Object.entries(distImports)) {
      if (pkg.imports[key] !== value) {
        pkg.imports[key] = value
        changed = true
      }
    }

    if (changed) {
      await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
      process.stdout.write('Updated package.json imports to dist for publish.\n')
    }
  } catch (error) {
    process.stderr.write(`Failed to set imports to dist: ${error}\n`)
    process.exitCode = 1
  }
}

main()
