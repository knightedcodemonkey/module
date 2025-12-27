# Hoisting and TDZ in identifier tracking

## Purpose

This library tracks module-scope identifiers so CJS↔ESM lowering can avoid collisions and emit correct exports/imports. We model only hoisting behaviors that affect module-scope resolution and skip cases that either error at runtime or are handled by the module loader.

## What we treat as hoisted

- `function` declarations at module scope: reads before the declaration are counted.
- `var` declarations at module scope: reads before the declaration are counted (value is `undefined`).

## What we do not hoist

- `let` / `const` / `class`: reads in the temporal dead zone are ignored for hoist accounting (they are runtime errors). See fixtures/tests under `test/fixtures/identifiers/hoisting/tdz.js`.
- `import` bindings: import hoisting is handled by the module system; we exclude imports from module-scope hoist tracking. See `test/fixtures/identifiers/hoisting/importHoist.js`.
- Function declarations inside blocks (strict mode): they stay block-scoped and are not treated as module-scope hoists. See `test/fixtures/identifiers/hoisting/functionInBlock.js`.

## Why this scope

- Our goal is collision-free lowering, not simulating all JS runtime hoisting/TDZ behavior.
- Excluding TDZ and import hoists keeps the identifier table focused on cases that meaningfully affect CJS↔ESM transforms.
