var a = 'a'
const b = 'b'
let c = 'c'
const d = (c = 'd')

function foo() {
  const e = 'e'

  function inner() {
    const z = 'z' + e
  }

  return inner()
}

const bar = function bar2(a) {
  // A read should not be recorded for identifier `a` in the function body (shadowed by the parameter)
  const baz = a
  // However, `b` should be recorded as a read here
  const qux = b

  return baz + qux
}

// theta should only be declared once
const theta = function theta() {
  return 'theta'
}
theta()

const iota = function a() {
  // iota should only be declared once
  const iota = function () {
    return 'iota'
  }
  return iota()
}

class f {
  g = 'g'

  constructor() {
    this.h = 'h'
  }

  i() {
    const j = 'j'

    return j
  }
}

// Top-level Block scoped
{
  const k = 'k'
  var l = 'l'
  class m {
    n = 'n'
  }
}

if (b) {
  const o = 'o'
  var p = 'p'
  class q {
    r = 'r'
  }
}

let s,
  t = 't',
  v = 'v'

// prettier-ignore
;(function c() {}())

;
;(function b() {})()
