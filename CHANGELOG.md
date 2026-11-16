# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.3] - 2026-11-16

### Fixed
- Packaging keeps `dist/cli.js` executable (mode 0755), so the `npx` binary starts.

### Changed
- `smoke-pack` is more robust: it checks the packed files and the CLI start.
- `ci:repro` has a committed-only mode (`CI_REPRO_COMMITTED=1`) that ignores uncommitted changes.
- Added a test that keeps the CI config in line with the repro and pack scripts.
- README: known limit for call arguments written as `{ ... } as const`, `satisfies` or a variable.

## [0.1.2] - 2026-11-16

### Fixed
- `check` runs only `llm-call` rules: comments naming rules of other plugins are no longer reported as unused or unknown.
- `check` translates ESLint's "no files matching" and "all files ignored" errors, notes skipped files on stderr, and reports parse errors with a file, line and `parse-error` label.

### Changed
- CI job has a 15-minute timeout and read-only `contents` permission.
- `npm run ci:repro` copies only git-tracked files, so it matches what CI checks out.
- README: badges, exit-code description, a Troubleshooting row for each new `check` message (same order in English and Korean), updated known limits.
- `SECURITY.md` describes this plugin instead of a generic demo.

## [0.1.1] - 2026-11-16

### Security
- Pin `minimatch` to 11.0.8 through `overrides` (GHSA-g3hv-75wg-m249, fixed in 11.0.1). It is a transitive dev dependency of `@typescript-eslint/typescript-estree`; the published plugin code is unchanged.

### Fixed
- Stay silent when a client variable is reassigned to something that is not provably the same SDK client.
- `check` now tells you to run from a parent folder when a path is outside the current folder, instead of printing a message without a line or rule.

### Changed
- `engines.node` is `^22.13.0 || >=24` (Node 20 is end-of-life); CI runs Node 22, 24 and 26 through `npm run verify`.
- Added `npm run ci:repro` to reproduce the CI job locally.


## [0.1.0] - 2026-11-16

### Added
- Rule `llm-call/no-unsupported-param`: model- and SDK-version-specific rejected parameters, driven by a data table
  (`max_tokens` on OpenAI reasoning models with autofix to `max_completion_tokens`, Responses `max_tokens` with autofix to
  `max_output_tokens`, sampling parameters on reasoning models with `reasoning_effort` awareness, Anthropic SDK 1.x
  `temperature`/`top_p`/`top_k`, Anthropic SDK 0.x `temperature` + `top_p` together).
- Rule `llm-call/json-mode-needs-json-word`: JSON mode without the word "JSON" in statically visible messages
  (option `countInstructions`).
- Rule `llm-call/strict-schema-shape`: inline strict JSON Schemas (`additionalProperties`, `required`, root `anyOf`,
  unsupported keywords, nesting depth, property count) for response formats and function tools.
- Rule `llm-call/anthropic-require-max-tokens`: missing `max_tokens` in Anthropic `messages.create` (suggestion only).
- Model table `src/data/models.json` with a source URL and check date per row; `settings.llmCall.models`, `disable`
  and `anthropicSdkMajor` for overrides.
- Automatic detection of the installed `@anthropic-ai/sdk` major version.
- CLI `eslint-plugin-llm-call` with `table` and `check`, English and Korean (`--lang`, `LLM_CALL_LINT_LANG`).
- `llmCall.configs.recommended` flat config.
