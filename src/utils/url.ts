// URL validation used when rewriting import.meta.url assignments.
const isValidUrl = (url: string) => {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export { isValidUrl }
