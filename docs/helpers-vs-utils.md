# Helpers vs utils

## Intent

- `helpers/`: small, pure AST-shape predicates/utilities. They inspect nodes but do not mutate `MagicString`, maintain state, or depend on transformation options. Safe to import anywhere (including formatters) without side effects.
- `utils/`: transformation plumbing and shared state. They may build/consume metadata, track identifiers/exports, or mutate `MagicString`/strings. Formatters and the main `format` pass call into these.

## Conventions

- `helpers/` should not import from `utils/` to keep them dependency-light. `utils/` may import `helpers/`.
- Keep `helpers/` functions small and specific (e.g., identifier/name guards, skip checks). If it holds cross-pass state or writes code, it belongs in `utils/`.
- When adding a new helper, check if it needs options or shared tables; if so, place it in `utils/` instead.

## Current layout (Dec 2025)

- `helpers/`: identifier/name helpers.
- `utils/`: exports collection, identifier tracking, language/specifier helpers, misc transformation utilities.

## Maintenance tips

- Periodically run a quick grep to remove unused helpers.
- If a helper starts mutating code or carrying state, move it into `utils/`.
