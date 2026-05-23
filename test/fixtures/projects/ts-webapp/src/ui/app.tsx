import { View } from './view.js'

import type { Config } from '../utils/config.js'

export type Rendered = { node: JSX.Element; props: Config }

export const renderApp = (config: Config): Rendered => ({
  node: <View title={config.title} target={config.targetId ?? 'root'} />,
  props: config,
})

export const mount = (config: Config) => renderApp(config)
