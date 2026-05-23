# CLI: `dub`

Command-line wrapper around `@knighted/module` for transforming files between ESM and CommonJS.

> [!NOTE]
> The name "dub" comes from the literal act of dubbing a squire into a knight—short, quick, and accurate.

## Requirements

- Node >= 22.21.1 (<23), >= 24 (<25), or >= 26 (<27)

## Installation

The CLI is shipped with the package. Install locally or use `npx`:

```bash
npm install @knighted/module
npx dub --help
```

## Usage

```bash
dub [options] <files...>
```

Examples:

- Transform CJS to ESM into an output directory (mirrors input paths inside the dir):

  ```bash
  dub -t module src/**/*.cjs --out-dir dist
  ```

- In-place ESM to CJS rewrite:

  ```bash
  dub -t commonjs src/**/*.mjs --in-place
  ```

- Preview changes without writing:

  ```bash
  dub -t module src/**/*.cjs --out-dir dist --dry-run --list --summary
  ```

- Stdin/stdout pipeline:

  ```bash
  cat input.cjs | dub -t module --stdin-filename input.cjs > output.mjs
  ```

- Single-file rename via stdout redirect (CLI has no "out file" flag; `--out-dir` always mirrors inputs):

  ```bash
  dub -t module src/some.cjs > src/some.mjs
  ```

## Options

Short and long forms are supported.

<!-- prettier-ignore-start -->
| Short | Long                       | Description                                                     |
| ----- | -------------------------- | --------------------------------------------------------------- |
| -t    | --target                   | Output format (module \| commonjs)                             |
| -x    | --transform-syntax         | Syntax transforms (true \| false \| globals-only)              |
| -r    | --rewrite-specifier        | Rewrite import specifiers (.js/.mjs/.cjs/.ts/.mts/.cts)         |
| -j    | --append-js-extension      | Append .js to relative imports (off \| relative-only \| all)   |
| -i    | --append-directory-index   | Append directory index (e.g. index.js) or false                 |
| -c    | --detect-circular-requires | Warn/error on circular require (off \| warn \| error)          |
| -H    | --detect-dual-package-hazard | Warn/error on mixed import/require of dual packages (off \| warn \| error) |
|       | --dual-package-hazard-scope | Scope for dual package hazard detection (file \| project)      |
| -a    | --top-level-await          | TLA handling (error \| wrap \| preserve)                       |
| -d    | --cjs-default              | Default interop (module-exports \| auto \| none)               |
| -e    | --idiomatic-exports        | Emit idiomatic exports when safe (off \| safe \| aggressive)    |
| -m    | --import-meta-prelude      | Emit import.meta prelude (off \| auto \| on)                   |
|       | --source-map               | Emit a source map (sidecar); use --source-map=inline for stdout |
| -n    | --nested-require-strategy  | Rewrite nested require (create-require \| dynamic-import)      |
| -R    | --require-main-strategy    | Detect main (import-meta-main \| realpath)                      |
| -l    | --live-bindings            | Live binding strategy (strict \| loose \| off)                 |
| -o    | --out-dir                  | Write outputs to a directory mirror                             |
| -p    | --in-place                 | Rewrite files in place                                          |
| -y    | --dry-run                  | Do not write files; report planned changes                      |
| -L    | --list                     | List files that would change                                    |
| -s    | --summary                  | Print a summary of work performed                               |
| -J    | --json                     | Emit machine-readable JSON summary/diagnostics                  |
| -C    | --cwd                      | Working directory for resolving files/out paths                 |
| -f    | --stdin-filename           | Virtual filename when reading from stdin                        |
| -g    | --ignore                   | Glob pattern(s) to ignore (repeatable)                          |
| -h    | --help                     | Show help                                                       |
| -v    | --version                  | Show version                                                    |
<!-- prettier-ignore-end -->

Notes:

- When reading from stdin, output is sent to stdout; `--out-dir` or `--in-place` are not allowed in that mode.
- Specify either `--out-dir` or `--in-place` for file inputs; stdout is used only when a single file is given and neither flag is set. `--out-dir` always mirrors the input path under that directory (no single-file rename flag). Use stdout redirection if you need to rename one file.
- Diagnostics are printed to stderr; use `--json` for machine-readable output.
