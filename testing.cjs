const obj = { exports: 'foo' }
class Foo {
  exports = 'foo'

  constructor() {
    this.exports = 'foo'
  }

  get exports() {}
}
new Foo().exports
