exports.counter = 0

function inc() {
  exports.counter += 1
}

inc()

exports.inc = inc
