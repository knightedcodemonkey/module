const first = await Promise.resolve(2)
const second = await new Promise(resolve => setTimeout(() => resolve(3), 5))

export const value = first + second
export default second
