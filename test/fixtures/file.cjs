// CommonJS was like the Wild Wild West (require.extensions is deprecated so meh).
// Too much implied behavior without requiring explicitness.

const { foo } = require('./test.js')

__filename
__dirname
require.main
require.cache
require.resolve('./test.js')

module
module.exports
module.exports = foo

exports
exports.commonjs = true
