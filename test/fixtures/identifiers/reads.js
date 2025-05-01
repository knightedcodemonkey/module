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

  // Read a
  epsilon1() {
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
/*
function eta() {
  class a {
    constructor() {
      const a = () => {
        // Read a
        return a
      }
      this.a = a()
    }
  }

  return new a()
}
console.log(eta())
*/

const theta = function a() {
  // Read a
  const theta1 = a

  return theta1
}
theta()

const iota = function () {
  /* This gets ignored becaue the VaribleDeclaration keeps the `a` in scope for iota */
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

  /* Here the scope for function a is removed, so not inscope, but referencing inner scope still */
  /* Might need to record the scope types and find the nearest BlockScope to record identifers and check if they are in scope */
  return a()
}
kappa()

// Read a
export default a

// Read a (once, the alias is not counted as a read)
export { a as a }

// Read a
export const f = a
