const obj = { foo: 'bar' }

with (obj) {
  console.log(foo)
}

eval('exports.evalled = true')
