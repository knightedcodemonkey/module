# Globals-only transform

`transformSyntax: 'globals-only'` rewrites well-known module globals lexically without emitting any runtime helpers or preludes. Imports/exports and interop are left untouched; runtime correctness depends on the target environment providing the globals you opt into.

## Scope

- Pure identifier/member rewrites; no injected helpers, shims, or prelude imports.
- Works in both directions (CJS ➜ ESM, ESM ➜ CJS).
- Diagnostics still surface for legacy constructs (e.g., `require.extensions`, `module.parent`).

## Rewrites at a glance

<!-- prettier-ignore-start -->
| Direction | Input | Output | Notes |
| --- | --- | --- | --- |
| CJS ➜ ESM | `__dirname` | `import.meta.dirname` | lexical swap |
| CJS ➜ ESM | `__filename` | `import.meta.filename` | lexical swap |
| CJS ➜ ESM | `require.main` | `import.meta.main` | skipped inside equality checks |
| CJS ➜ ESM | `require.resolve(...)` | `import.meta.resolve(...)` | no helper emitted* |
| CJS ➜ ESM | `module.require(...)` | `require(...)` | collapses to ambient require |
| CJS ➜ ESM | `require.cache` | `{}` | best-effort stub + warning |
| CJS ➜ ESM | `require.extensions` | (unchanged) | warning emitted |
| CJS ➜ ESM | `module.parent / module.children` | (unchanged) | warning emitted |
| ESM ➜ CJS | `import.meta` | `module` | bare meta expression |
| ESM ➜ CJS | `import.meta.url` | `require("node:url").pathToFileURL(__filename).href` | URL-shaped contract |
| ESM ➜ CJS | `import.meta.filename` | `__filename` | lexical swap |
| ESM ➜ CJS | `import.meta.dirname` | `__dirname` | lexical swap |
| ESM ➜ CJS | `import.meta.resolve(...)` | `require.resolve(...)` | string-path semantics |
| ESM ➜ CJS | `import.meta.main` | `process.argv[1] === __filename` | inline check |
| ESM ➜ CJS | other `import.meta.*` | `module.*` | no extra objects created |
<!-- prettier-ignore-end -->

\* In globals-only, we do not inject the CJS-style `require.resolve` helper. The rewrite relies on the host's native `import.meta.resolve`, whose semantics differ (URL-based, parent handling). Use full transforms if you need the helper that preserves CJS resolution behavior.

## When to use it

- Pre-`tsc` mitigation for TypeScript’s [asymmetry on module globals](https://github.com/microsoft/TypeScript/issues/58658) (see `test/cli.ts`): rewrite globals so the checker sees the target-side shapes without altering import/export syntax.
- Tooling pipelines that only need syntax-level compatibility and will supply the required globals at runtime.

## When not to use it

- When you need runtime shims (e.g., `createRequire`, import.meta polyfills) or interop helpers: use `transformSyntax: true` instead.

## Caveats

- Behavior relies on the target runtime’s built-ins; no guarantees are made about availability or semantics of the rewritten globals.
- Legacy fields like `require.cache`, `require.extensions`, `module.parent`, and `module.children` only receive warnings/stubs—behavior may differ from Node.
