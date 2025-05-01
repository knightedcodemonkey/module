{
  const foo = 'foo'
  var bar = 'bar'
}

if (true) {
  const foo = 'foo'
  var qux = 'qux'
}

let i = 2
while (i > 0) {
  const foo = 'foo'
  var loop = 'loop'
  i--
}

function foo() {
  const foo = 'foo'
  var baz = 'baz'
}

const bark = () => {
  const bar = 'bar'
  var boo = 'boo'
}

console.log(bar) // 'foo'
console.log(qux) // 'qux'
console.log(loop)
