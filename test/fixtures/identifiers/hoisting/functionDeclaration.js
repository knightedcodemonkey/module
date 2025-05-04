foo()
foo()

function foo() {
  return bar()
}

bar()
;(function bar() {})()

class Baz {
  bar

  static bar

  constructor() {
    this.bar = bar()
  }

  get bar() {}
}

const thing = { bar: 'baz' }

function bar() {
  return 'bar'
}

bar()
foo()
