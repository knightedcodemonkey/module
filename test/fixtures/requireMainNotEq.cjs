if (require.main !== module) {
  module.exports = { main: false }
} else {
  module.exports = { main: true }
}
