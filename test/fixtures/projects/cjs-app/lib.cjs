const path = require('node:path')

exports.value = 1
exports.basename = file => path.basename(file)
exports.bump = v => v + exports.value
exports.dynamicLoad = id => require(id).value

if (require.main === module) {
  console.log(exports.bump(2))
}
