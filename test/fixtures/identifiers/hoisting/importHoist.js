// Imports are hoisted by the module system, but we do not treat them as part of
// the module-scope identifier hoisting for collision/reads accounting.

import { x } from './importHoistDep.js'

const a = x
const b = (() => x)()

export { a, b }
