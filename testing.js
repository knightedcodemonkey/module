a()
console.log(c)
console.log(d)
const foo = 'bar'
function a() {
  b()
  function b() {
    console.log('b')
  }
  var d = 'd'
}
var c = 'c'
