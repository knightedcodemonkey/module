console.log(foo)
console.log(bar)
{
  var foo = 'foo'
  {
    var bar = 'bar'
  }
}

class Foo {
  foo() {
    var baz = 'baz'
  }
}

const a = class {
  constructor() {
    var quxx = 'quxx'
  }
}

const b = () => {
  var quux = 'quux'
}

const c = function () {
  var quuxx = 'quuxx'
}

function* generator() {
  var quuxxx = 'quuxxx'
}

console.log(qux)

try {
  throw new Error('test')
} catch (e) {
  var qux = 'qux'
}

console.log(forloop)
for (let i = 0; i < 10; i++) {
  var forloop = 'forloop'
}

console.log(other)(() => {
  var other = 'other'
})()
