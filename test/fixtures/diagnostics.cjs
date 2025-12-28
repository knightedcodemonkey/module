module.exports = { a: 1 }
exports.b = 2

let foo = 1
exports.foo = foo
foo = 2

exports['weird-name'] = 3

require.cache
return
