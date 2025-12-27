if (module === require.main) {
  module.exports = { main: true }
} else {
  module.exports = { main: false }
}
