exports['foo-bar'] = 'fb'
exports['zap'] = 2

module.exports = {
  bag: exports,
  fooBar: exports['foo-bar'],
  zap: exports['zap'],
}
