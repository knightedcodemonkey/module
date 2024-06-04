import { commonjs } from './file.cjs'

import.meta
import.meta.url
import.meta.dirname
import.meta.filename
import.meta.resolve('./file.cjs')
import.meta.resolve(`${import.meta.dirname}/other.js`)

const detectCalledFromCli = async path => {
  const realPath = await realpath(path)

  if (import.meta.url === pathToFileURL(realPath).href) {
    stdout.write('invoked as cli')
  }
}

detectCalledFromCli(argv[1])

export const esmodule = true
export { commonjs }
