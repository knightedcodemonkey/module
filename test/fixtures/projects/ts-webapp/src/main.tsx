import type { Config } from './utils/config.js'
import { renderApp } from './ui/app.js'

export const boot = async (url: string) => {
  const { loadConfig } = await import('./utils/config.js')
  const loaded = await loadConfig(url)
  const rendered = renderApp(loaded)
  return { rendered, url }
}

export const lazyApp = async () => {
  const { renderApp: render } = await import('./ui/app.js')
  return render({ title: 'lazy' })
}

export const hydrate = (target: HTMLElement, config: Config) =>
  renderApp({ ...config, targetId: target.id })
