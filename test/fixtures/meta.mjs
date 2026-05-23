import { dirname as pathDirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const filename = fileURLToPath(import.meta.url)
const dirname = pathDirname(filename)

export { dirname, filename }
export default { dirname, filename }
