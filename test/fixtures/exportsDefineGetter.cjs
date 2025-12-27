let count = 0
Object.defineProperty(exports, 'next', {
  get() {
    count += 1
    return count
  },
})
