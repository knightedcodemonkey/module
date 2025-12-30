# Dual Package Hazard Diagnostics

This tool can warn or error when a file mixes specifiers that may trigger the dual package hazard (ESM vs CJS instances of the same package).

## Option

- `detectDualPackageHazard`: `off` | `warn` (default) | `error`
  - CLI: `--detect-dual-package-hazard`, short `-H`.
  - `warn`: emit diagnostics but continue.
  - `error`: diagnostics are emitted and the transform exits non-zero.
  - `off`: skip detection.
- `dualPackageHazardScope`: `file` (default) | `project`
  - CLI: `--dual-package-hazard-scope` (long-only).
  - `file`: run detection independently per file (legacy behavior).
  - `project`: aggregate usages across all CLI inputs, then emit one diagnostic set per package. Per-file detection is disabled when this is on.

## What we detect (per file)

- Mixed import/require of the same bare package (including subpaths).
  - Diagnostic: `dual-package-mixed-specifiers`.
- Root vs subpath specifiers of the same package (e.g., `pkg` and `pkg/module`).
  - Diagnostic: `dual-package-subpath`.
- When both import and require occur, and package.json shows divergent entrypoints (conditional exports, module/main disagreements, or type: module with CJS main).
  - Diagnostic: `dual-package-conditional-exports`.

## How it works

- Static string specifiers only (import/export-from, import(), require literals).
- Computes the package root from bare specifiers (ignores relative/absolute, node: builtins, URLs).
- Looks up package.json under `node_modules/<pkg>` relative to the current file/cwd when available.
- Best-effort: if the manifest cannot be read, the manifest-based diagnostic is skipped.

## What is not covered

- Cross-file or whole-project graph analysis unless `dualPackageHazardScope: 'project'` is enabled.
- Dynamic or template specifiers; non-literal specifiers are ignored.
- Loader/bundler resolution differences (pnpm linking, aliases, custom conditions).
- Exact equality of root vs subpath targets; we do not stat/resolve to see if they point to the same file, so a root/subpath warning may be conservative.

## Project-wide analysis (opt-in)

- Set `--dual-package-hazard-scope project` (CLI) or `dualPackageHazardScope: 'project'` (API).
- The CLI pre-scans all input files, aggregates package usage (import vs require, root vs subpath), and emits diagnostics per package. Per-file hazard checks are turned off in this mode to avoid duplicate messages.
- Still uses static literal specifiers and manifest reads under `node_modules`; aliasing/path-mapping differences may not be reflected.

## Guidance

- Prefer a single specifier form for a given package: either all import or all require, and avoid mixing root and subpath unless you know they share the same build.
- Use `-H error` (or `detectDualPackageHazard: 'error'`) in CI to block new hazards once noise is acceptable for your codebase.
- If you need to suppress noise temporarily, set the option to `warn` while you align specifiers or package metadata.
