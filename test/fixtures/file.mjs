const bare = import.meta
const url = import.meta.url
const filename = import.meta.filename
const dirname = import.meta.dirname
const resolved = import.meta.resolve('./values.mjs')

export { bare, url, filename, dirname, resolved }
