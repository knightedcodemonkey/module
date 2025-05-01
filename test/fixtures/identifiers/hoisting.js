/**
 * Function declaration hoisting:
 * - Focus on top-level function declarations (nested functions are not hoisted)
 * var declartion hoisting in module scope
 * - Focus on top-level var declarations (nested var declarations are not hoisted)
 *
 * Probably best to have this controlled by an experimental option (maybe just for function declarations)
 */

function eta() {
  class a {
    constructor() {
      // This is hoisted actually
      function a() {
        // Read a
        return a
      }
      this.a = a()
    }
  }

  console.log(typeof a)
  return new a()
}
