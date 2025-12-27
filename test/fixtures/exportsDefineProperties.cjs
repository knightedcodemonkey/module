const value = 'ok'
Object.defineProperties(module.exports, {
  alpha: { value },
  beta: {
    get() {
      return value + '!'
    },
  },
})
