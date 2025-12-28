export const mainFlag = import.meta.main ? 'main' : 'not-main'
export function run() {
  return import.meta.main ? 'main-run' : 'lib-run'
}
