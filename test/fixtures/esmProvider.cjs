'use strict'

module.exports = {
  default: 'default-val',
  foo: 'foo-val',
  bar: 'bar-val',
  live: 1,
}

const timer = setInterval(() => {
  module.exports.live += 1
}, 10)

// Avoid keeping the event loop alive in tests
if (typeof timer.unref === 'function') {
  timer.unref()
}
