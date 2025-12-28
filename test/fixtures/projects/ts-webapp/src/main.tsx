import type { Config } from './utils/config.ts'
import { renderApp } from './ui/app.tsx'

export const boot = async (url: string) => {
  const { loadConfig } = await import('./utils/config.ts')
  const loaded = await loadConfig(url)
  const rendered = renderApp(loaded)
  return { rendered, url }
}

export const lazyApp = async () => {
  const { renderApp: render } = await import('./ui/app.tsx')
  return render({ title: 'lazy' })
}

export const hydrate = (target: HTMLElement, config: Config) =>
  renderApp({ ...config, targetId: target.id })
