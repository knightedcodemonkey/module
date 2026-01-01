const section = 'alpha'

await import('./file.js')
await import(`./tmpl/${section}.js`)
require('./file.js')
require(`./tmpl/${section}.js`)
