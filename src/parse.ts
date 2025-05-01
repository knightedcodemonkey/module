import { parseSync } from 'oxc-parser'

const parse = (filename: string, code: string) => {
  return parseSync(filename, code)
}

export { parse }
