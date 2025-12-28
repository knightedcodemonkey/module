const fs = require('fs')
const fsp = require('fs/promises')
const assert = require('node:assert')

module.exports = {
  summary: {
    fs: typeof fs.readFile,
    fsp: typeof fsp.readFile,
    assert: typeof assert.strictEqual,
  },
}
