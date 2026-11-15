# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]


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
