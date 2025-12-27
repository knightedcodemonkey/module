;({ alpha: exports.alpha, beta: module.exports.beta } = { alpha: 'A', beta: 'B' })

const obj = { foo: 1, bar: 2 }
const ref = exports
;({ foo: ref.foo } = obj)

exports
