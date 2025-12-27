// In strict mode, function declarations inside blocks are block-scoped and not hoisted
// to the outer scope. Ensure we don't count reads before the declaration as hoisted.

{
  func()
  function func() {
    return 'block-func'
  }
}

export {}
