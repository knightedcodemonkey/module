let a = 'a'
// Read a
const b = (a = 'b')
// Read a
const c = `${a}foo`

function alpha() {
  const alpha1 = 'alpha1'

  // Read a
  return alpha1 + a
}
alpha()

function beta(a) {
  const e = a

  return e
}
beta()

// Read a (AssignmentPattern)
const gamma = (p = a) => {
  const gamma1 = p

  return gamma1
}
gamma()

function delta(...a) {
  const delta1 = a[0]

  return delta1
}

delta()

// Read a (only the value, not the key)
const thing = { inner: {}, a: a }

// Read a once (not member expression)
thing.a = a
// Read a once (not member expression)
thing.inner.a = a
// Read a once (not member expression)
gamma.a = a

class Epsilon {
  constructor(a) {
    this.a = a
  }

  epsilon1() {
    // Read a
    return a
  }
}
new Epsilon('a')

const zeta = () => {
  // Read a
  const zeta1 = a

  return zeta1
}
zeta()
;(a => {
  a
  // Read a
})(a)
;(function a(p) {
  p
  // Read a
})(a)

function eta() {
  class a {
    constructor() {
      const a = () => {
        return a
      }
      this.a = a()
    }
  }

  return new a()
}
eta()

const theta = function a() {
  const theta1 = a

  return theta1
}
theta()

const iota = function () {
  const a = () => {
    return 'inner a'
  }

  return a()
}
iota()

const kappa = function () {
  function a() {
    const a = 'inner a'
    return a
  }

  return a()
}
kappa()

class Lambda {
  a = 'aa'

  static a

  static {
    this.a = 'static a'
  }

  get a() {
    return this.a
  }

  lambda1() {
    // Read a
    return a
  }
}
new Lambda('a')

class Mu {
  a = 'aa'

  constructor(a) {
    this.a = a
  }

  mu1() {
    // Read a
    return a
  }
}
new Mu('passed a')

class Nu {
  a = 'aa'

  constructor() {
    // Read a (also shadows the class field)
    this.a = a
  }

  nu1() {
    return this.a
  }
}
new Nu('passed a')

// Read a
export default a

// Read a (once, the alias is not counted as a read)
export { a as a }

// Read a
export const f = a
