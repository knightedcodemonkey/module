import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const pkgPath = resolve('package.json')
const srcImports = {
  '#parse': './src/parse.js',
  '#format': './src/format.js',
  '#utils/*.js': './src/utils/*.js',
  '#walk': './src/walk.js',
  '#helpers/*.js': './src/helpers/*.js',
  '#formatters/*.js': './src/formatters/*.js',
}

const main = async () => {
  try {
    const raw = await readFile(pkgPath, 'utf8')
    const pkg = JSON.parse(raw)
    pkg.imports ||= {}

    let changed = false
    for (const [key, value] of Object.entries(srcImports)) {
      if (pkg.imports[key] !== value) {
        pkg.imports[key] = value
        changed = true
      }
    }

    if (changed) {
      await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
      process.stdout.write('Restored package.json imports to src after pack.\n')
    }
  } catch (error) {
    process.stderr.write(`Failed to restore imports to src: ${error}\n`)
    process.exitCode = 1
  }
}

main()
