let counter = 0

const bump = () => {
  counter += 1
}

setTimeout(() => {
  counter += 1
}, 20)

module.exports = {
  get counter() {
    return counter
  },
  bump,
}
