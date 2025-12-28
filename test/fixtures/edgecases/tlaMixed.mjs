export let counter = 0
export function inc() {
  counter += 1
  return counter
}

const double = () => counter * 2
export default function current() {
  return counter
}

await Promise.resolve().then(() => {
  counter += 1
})

export const doubled = double()
