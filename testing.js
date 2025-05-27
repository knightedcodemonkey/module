const method = 'method'

const obj = {
  [method]: function () {
    return 'Hello, world!'
  },
}
console.log(obj.method())
