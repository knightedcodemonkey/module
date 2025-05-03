const kappa = function () {
  function a() {
    const a = 'inner a'
    return a
  }

  return a()
}
