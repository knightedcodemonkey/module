const defaultInteropName = '__interopDefault'
const interopHelper = `const ${defaultInteropName} = mod => (mod && mod.__esModule ? mod.default : mod);\n`
const requireInteropName = '__requireDefault'
const requireInteropHelper = `const ${requireInteropName} = mod => (mod && typeof mod === 'object' && 'default' in mod ? mod.default : mod);\n`

export { defaultInteropName, interopHelper, requireInteropHelper, requireInteropName }
