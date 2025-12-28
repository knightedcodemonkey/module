export type Config = { title: string; targetId?: string }

export const loadConfig = async (url: string): Promise<Config> => ({
  title: new URL(url).hostname || 'app',
  targetId: 'root',
})
