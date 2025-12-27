// These TDZ reads would throw at runtime; we should not count them as safe hoists.
// Access before declaration (let/const/class) remains in the TDZ.

// let
const a = (() => {
  try {
    return foo
  } catch {
    return 'tdz'
  }
})()
let foo = 'foo'

// const
const b = (() => {
  try {
    return bar
  } catch {
    return 'tdz'
  }
})()
const bar = 'bar'

// class
const c = (() => {
  try {
    return Baz
  } catch {
    return 'tdz'
  }
})()
class Baz {}

// nested block TDZ
{
  const d = (() => {
    try {
      return inner
    } catch {
      return 'tdz'
    }
  })()
  const inner = 'inner'
}

export { a, b, c }
