const obj = { a: 1, b: { c: 2 }, d: [3, { f: 4 }], extra: 5 }
const arr = [1, 2, 3]

const {
  a,
  b: { c },
  d: [e, { f }],
  ...g
} = obj
const [h, , ...i] = arr
const { x = 1, y: { z = 2 } = {} } = obj
