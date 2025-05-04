// Read someVar
const a = someVar

var someVar = 'someVar'

// Read otherVar
const b = otherVar

class C {
  // Read c (once)
  static c = c

  constructor() {
    // Read c (once)
    this.c = c
  }

  get c() {
    // Read c (once)
    return c
  }
}

const cee = { c: 'cee' }

var c = otherVar

{
  var otherVar = 'otherVar'
}

// Read otherVar
const d = otherVar

// Read block
const e = block
// Read innerBlock
const f = innerBlock

{
  var block = 'block'

  {
    var innerBlock = 'innerBlock'
  }
}

// Read catchVar
const g = catchVar

try {
  throw new Error('error')
} catch (err) {
  var catchVar = 'catchVar'
}
