function wrap(__dirname, __filename) {
  const localDir = __dirname
  const localFile = __filename

  return {
    localDir,
    localFile,
    load: name => require(name),
  }
}

const result = wrap('fake-dir', 'fake-file')

exports.topDir = __dirname
exports.topFile = __filename
exports.local = result
