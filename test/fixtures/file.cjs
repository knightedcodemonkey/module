// CommonJS was like the Wild Wild West (require.extensions is deprecated so meh).
// Too much implied behavior without requiring explicitness.

const { esmodule } = require('./file.mjs')

__filename
__dirname
require.main
require.cache
require.resolve('./file.mjs')

module
module.exports
module.exports = foo

exports
exports.commonjs = true
exports.esmodule = esmodule
