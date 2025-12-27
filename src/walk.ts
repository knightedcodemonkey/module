import type { Node } from 'oxc-parser'
import { visitorKeys } from 'oxc-parser'

/**
 * Using visitorKeys instead of oxc Visitor to keep
 * an ancestor-aware enter/leave API with this.skip()
 * without per-node method boilerplate.
 */

type AncestorContext = {
  skip: () => void
}

type AncestorVisitor = {
  enter?: (this: AncestorContext, node: Node, ancestors: Node[]) => void | Promise<void>
  leave?: (this: AncestorContext, node: Node, ancestors: Node[]) => void | Promise<void>
}

type WalkVisitor = {
  enter?: (this: AncestorContext, node: Node, parent: Node | null) => void | Promise<void>
  leave?: (this: AncestorContext, node: Node, parent: Node | null) => void | Promise<void>
}

let skipDepth = -1

const isNodeLike = (value: unknown): value is Node => {
  return Boolean(value && typeof value === 'object' && 'type' in value)
}

const traverse = async (
  node: Node,
  visitors: AncestorVisitor,
  ancestors: Node[],
  depth: number,
) => {
  if (!node) return

  const keys = visitorKeys[node.type] ?? []
  const ctx: AncestorContext = {
    skip: () => {
      skipDepth = depth
    },
  }

  ancestors.push(node)

  if (visitors.enter) {
    await visitors.enter.call(ctx, node, ancestors)
  }

  if (skipDepth === -1 || depth < skipDepth) {
    const fields = node as unknown as Record<string, unknown>
    for (const key of keys) {
      const child = fields[key]

      if (Array.isArray(child)) {
        for (const nested of child) {
          if (isNodeLike(nested)) {
            await traverse(nested, visitors, ancestors, depth + 1)
          }
        }
      } else if (isNodeLike(child)) {
        await traverse(child, visitors, ancestors, depth + 1)
      }
    }
  }

  if (visitors.leave) {
    await visitors.leave.call(ctx, node, ancestors)
  }

  ancestors.pop()

  if (skipDepth === depth) {
    skipDepth = -1
  }
}

const ancestorWalk = async (node: Node, visitors: AncestorVisitor) => {
  skipDepth = -1
  await traverse(node, visitors, [], 0)
}

const walk = async (node: Node, visitors: WalkVisitor) => {
  const wrap: AncestorVisitor = {
    enter(current, ancestors) {
      const parent = ancestors[ancestors.length - 2] ?? null
      if (visitors.enter) {
        return visitors.enter.call(this, current, parent)
      }
    },
    leave(current, ancestors) {
      const parent = ancestors[ancestors.length - 2] ?? null
      if (visitors.leave) {
        return visitors.leave.call(this, current, parent)
      }
    },
  }

  await ancestorWalk(node, wrap)
}

export { ancestorWalk, walk }
