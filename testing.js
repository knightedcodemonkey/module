const a = 'outer a'
class Nu {
  a = 'aa'

  constructor() {
    this.a = a
  }

  nu1() {
    return this.a
  }
}
const A = new Nu('passed a')

console.log(A.nu1()) // outer a
console.log(A.a) // passed a
