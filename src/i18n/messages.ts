/**
 * All user-facing text lives here, in English and Korean, with identical keys.
 * Keys starting with `rule.` are ESLint rule messages (`meta.messages`), the rest are CLI text.
 * Placeholders use `{{name}}`.
 */

export type Lang = 'en' | 'ko';

const en = {
  // no-unsupported-param
  'rule.rejectedUse': "Model '{{model}}' rejects '{{param}}'; use '{{replacement}}' instead.",
  'rule.rejectedNoModelUse': "The Responses API has no '{{param}}'; use '{{replacement}}' instead.",
  'rule.rejectedReasoning': "Model '{{model}}' is a reasoning model and rejects '{{param}}'.",
  'rule.rejectedEffort':
    "Model '{{model}}' only accepts '{{param}}' when reasoning effort is 'none' ({{effort}}).",
  'rule.rejectedSdk1':
    "Anthropic API version 2026-10-21 (SDK {{sdk}}.x) rejects '{{param}}' on every model.",
  'rule.rejectedPair': "Model '{{model}}' rejects '{{param}}' together with '{{other}}'; send only one of them.",
  'rule.suggestRemove': "Remove '{{param}}'.",
  // json-mode-needs-json-word
  'rule.jsonWordMissing':
    "JSON mode ('json_object') requires the word 'JSON' somewhere in the messages, but none was found. The API answers with a 400.",
  // strict-schema-shape
  'rule.missingAdditionalProperties':
    "Strict schema: the object at '{{path}}' needs 'additionalProperties: false'.",
  'rule.suggestAddAdditionalProperties': "Add 'additionalProperties: false'.",
  'rule.missingRequired':
    "Strict schema: 'required' at '{{path}}' must list every property; missing: {{names}}.",
  'rule.rootNotObject': "Strict schema: the root schema must be an object (found '{{type}}').",
  'rule.rootAnyOf': "Strict schema: the root schema must not use 'anyOf'.",
  'rule.unsupportedKeyword': "Strict schema: '{{keyword}}' is not supported (at '{{path}}').",
  'rule.tooDeep': "Strict schema: nesting deeper than {{max}} levels (at '{{path}}').",
  'rule.tooManyProperties': 'Strict schema: more than {{max}} properties in total ({{count}}).',
  // anthropic-require-max-tokens
  'rule.maxTokensRequired': "Anthropic 'messages.create' requires 'max_tokens'.",
  'rule.suggestAddMaxTokens': "Add 'max_tokens: 1024'.",
  // anthropic-thinking-config
  'rule.thinkingBudgetTooSmall':
    "'thinking.budget_tokens' is {{value}}; the API rejects values below {{min}} with a 400.",
  'rule.thinkingEnabledRejected':
    "Model '{{model}}' does not support thinking type 'enabled' (budget_tokens) and answers with a 400; use type 'adaptive'.",
  'rule.thinkingAdaptiveRejected':
    "Model '{{model}}' does not support thinking type 'adaptive' and answers with a 400; use type 'enabled' with 'budget_tokens'.",

  // CLI: table
  'table.id': 'Id',
  'table.model': 'Model',
  'table.api': 'API',
  'table.forbidden': 'Rejected parameters',
  'table.replacement': 'Replacement',
  'table.condition': 'Condition',
  'table.source': 'Source',
  'table.checked': 'Checked',
  'table.note': 'The table is a snapshot; provider rules change. Check the source and date before trusting a row.',
  // CLI: general
  'cli.usage': [
    'Usage: eslint-plugin-llm-call <command> [options]',
    '',
    'Commands:',
    '  table [--provider openai|anthropic] [--json]   Show the model constraint table',
    '  check <paths...>                               Lint files with the recommended rules',
    '',
    'Options:',
    '  --lang en|ko   Output language (default: LLM_CALL_LINT_LANG, then LC_ALL / LC_MESSAGES / LANG)',
    '  --help         Show this help',
    '  --version      Show the version',
  ].join('\n'),
  'cli.unknownCommand': "Unknown command '{{command}}'. Run with --help to list commands.",
  'cli.unknownOption': "Unknown option '{{option}}'. Run with --help to list options.",
  'cli.badLang': "Invalid --lang value '{{value}}'. Use 'en' or 'ko'.",
  'cli.badProvider': "Invalid --provider value '{{value}}'. Use 'openai' or 'anthropic'.",
  'cli.missingValue': "Option '{{option}}' needs a value.",
  'cli.checkNeedsPaths': "'check' needs at least one file or directory, for example: check src/",
  'cli.noTsParser':
    "Skipped {{count}} TypeScript file(s): install '@typescript-eslint/parser' in this project to lint .ts/.tsx files.",
  'cli.noEslint': "Could not load 'eslint'. Install it (npm i -D eslint) and run the command again.",
  'cli.outsideCwd':
    "Skipped '{{path}}': it is outside the current folder. Run the command from a parent folder that contains it (cd to it first).",
  'cli.noFiles': "No files matching '{{path}}' were found. Check the path or run from the project folder.",
  'cli.allIgnored':
    "Nothing to check under '{{path}}': every file there is ignored (node_modules/, dist/) or is not a .js/.mjs/.cjs/.jsx file (.ts/.tsx need '@typescript-eslint/parser').",
  'cli.ignoredFile': "Skipped '{{path}}': files under node_modules/ and dist/ are not checked.",
  'cli.unsupportedFile':
    "Skipped '{{path}}': not a file type this command checks (.js, .mjs, .cjs, .jsx; .ts/.tsx with '@typescript-eslint/parser').",
  'cli.parseError': 'Could not parse this file (parser says: {{detail}})',
  'cli.eslintError': 'ESLint stopped with an error (original message: {{message}})',
  'cli.noProblems': 'No problems found.',
  'cli.summary': 'Found {{count}} problem(s) in {{files}} file(s).',
  'cli.fixable': '{{count}} fixable with `eslint --fix`.',

  // demo script
  'demo.tsc': 'tsc: {{count}} {{unit}}',
  'demo.tscUnitOne': 'error',
  'demo.tscUnitMany': 'errors',
  'demo.llm': 'llm-call: {{count}} {{unit}}',
  'demo.problemUnitOne': 'problem',
  'demo.problemUnitMany': 'problems',
  'demo.file': '{{file}}: {{count}} {{unit}}',
  'demo.intro': 'Practice demo (mock calls, no API is contacted): what TypeScript sees vs. what llm-call sees.',
} as const;

export type MessageKey = keyof typeof en;

const ko: Record<MessageKey, string> = {
  'rule.rejectedUse': "모델 '{{model}}'은(는) '{{param}}'을(를) 거부합니다. '{{replacement}}'을(를) 쓰세요.",
  'rule.rejectedNoModelUse': "Responses API 에는 '{{param}}'이(가) 없습니다. '{{replacement}}'을(를) 쓰세요.",
  'rule.rejectedReasoning': "모델 '{{model}}'은(는) 추론 모델이라 '{{param}}'을(를) 거부합니다.",
  'rule.rejectedEffort':
    "모델 '{{model}}'은(는) 추론 강도가 'none'일 때만 '{{param}}'을(를) 받습니다 ({{effort}}).",
  'rule.rejectedSdk1':
    "Anthropic API 버전 2026-10-21(SDK {{sdk}}.x)은 모든 모델에서 '{{param}}'을(를) 거부합니다.",
  'rule.rejectedPair': "모델 '{{model}}'은(는) '{{param}}'과(와) '{{other}}'을(를) 함께 보내면 거부합니다. 하나만 보내세요.",
  'rule.suggestRemove': "'{{param}}' 지우기.",
  'rule.jsonWordMissing':
    "JSON 모드('json_object')는 메시지 어딘가에 'JSON' 낱말이 있어야 하는데 찾지 못했습니다. API 가 400 으로 답합니다.",
  'rule.missingAdditionalProperties':
    "strict 스키마: '{{path}}'의 객체에 'additionalProperties: false'가 필요합니다.",
  'rule.suggestAddAdditionalProperties': "'additionalProperties: false' 추가.",
  'rule.missingRequired':
    "strict 스키마: '{{path}}'의 'required'는 모든 속성을 나열해야 합니다. 빠진 속성: {{names}}.",
  'rule.rootNotObject': "strict 스키마: 루트 스키마는 객체여야 합니다 (현재 '{{type}}').",
  'rule.rootAnyOf': "strict 스키마: 루트 스키마에는 'anyOf'를 쓸 수 없습니다.",
  'rule.unsupportedKeyword': "strict 스키마: '{{keyword}}'은(는) 지원되지 않습니다 ('{{path}}').",
  'rule.tooDeep': "strict 스키마: 중첩이 {{max}}단계를 넘습니다 ('{{path}}').",
  'rule.tooManyProperties': 'strict 스키마: 전체 속성이 {{max}}개를 넘습니다 ({{count}}개).',
  'rule.maxTokensRequired': "Anthropic 'messages.create' 는 'max_tokens'가 필수입니다.",
  'rule.suggestAddMaxTokens': "'max_tokens: 1024' 추가.",
  'rule.thinkingBudgetTooSmall':
    "'thinking.budget_tokens' 가 {{value}}입니다. API 는 {{min}} 미만 값을 400 으로 거부합니다.",
  'rule.thinkingEnabledRejected':
    "모델 '{{model}}'은(는) thinking type 'enabled'(budget_tokens)를 지원하지 않아 400 으로 답합니다. type 'adaptive'를 쓰세요.",
  'rule.thinkingAdaptiveRejected':
    "모델 '{{model}}'은(는) thinking type 'adaptive'를 지원하지 않아 400 으로 답합니다. 'budget_tokens'와 함께 type 'enabled'를 쓰세요.",

  'table.id': 'ID',
  'table.model': '모델',
  'table.api': 'API',
  'table.forbidden': '거부되는 매개변수',
  'table.replacement': '대체',
  'table.condition': '조건',
  'table.source': '출처',
  'table.checked': '확인 날짜',
  'table.note': '이 표는 확인 시점의 스냅샷입니다. 제공사 규칙은 바뀌므로 출처와 날짜를 보고 판단하세요.',
  'cli.usage': [
    '사용법: eslint-plugin-llm-call <명령> [옵션]',
    '',
    '명령:',
    '  table [--provider openai|anthropic] [--json]   모델 제약 표 보기',
    '  check <경로...>                                권장 규칙으로 파일 검사',
    '',
    '옵션:',
    '  --lang en|ko   출력 언어 (기본: LLM_CALL_LINT_LANG, 그다음 LC_ALL / LC_MESSAGES / LANG)',
    '  --help         도움말',
    '  --version      버전',
  ].join('\n'),
  'cli.unknownCommand': "알 수 없는 명령 '{{command}}'. --help 로 명령 목록을 보세요.",
  'cli.unknownOption': "알 수 없는 옵션 '{{option}}'. --help 로 옵션 목록을 보세요.",
  'cli.badLang': "--lang 값 '{{value}}'이(가) 잘못됐습니다. 'en' 또는 'ko'를 쓰세요.",
  'cli.badProvider': "--provider 값 '{{value}}'이(가) 잘못됐습니다. 'openai' 또는 'anthropic'을 쓰세요.",
  'cli.missingValue': "옵션 '{{option}}'에는 값이 필요합니다.",
  'cli.checkNeedsPaths': "'check' 에는 파일이나 폴더가 하나 이상 필요합니다. 예: check src/",
  'cli.noTsParser':
    "TypeScript 파일 {{count}}개를 건너뛰었습니다. .ts/.tsx 를 검사하려면 이 프로젝트에 '@typescript-eslint/parser'를 설치하세요.",
  'cli.noEslint': "'eslint'를 불러오지 못했습니다. 설치(npm i -D eslint)한 뒤 다시 실행하세요.",
  'cli.outsideCwd':
    "'{{path}}' 은(는) 현재 폴더 밖이라 건너뛰었습니다. 그 파일을 포함하는 상위 폴더로 이동한 뒤 다시 실행하세요.",
  'cli.noFiles': "'{{path}}' 에 해당하는 파일이 없습니다. 경로를 확인하거나 프로젝트 폴더에서 실행하세요.",
  'cli.allIgnored':
    "'{{path}}' 에는 검사할 파일이 없습니다. 모두 제외 대상(node_modules/, dist/)이거나 .js/.mjs/.cjs/.jsx 파일이 아닙니다(.ts/.tsx 는 '@typescript-eslint/parser' 필요).",
  'cli.ignoredFile': "'{{path}}' 은(는) 건너뛰었습니다. node_modules/ 와 dist/ 아래 파일은 검사하지 않습니다.",
  'cli.unsupportedFile':
    "'{{path}}' 은(는) 건너뛰었습니다. 이 명령이 검사하는 파일 형식이 아닙니다(.js, .mjs, .cjs, .jsx, '@typescript-eslint/parser'가 있으면 .ts/.tsx).",
  'cli.parseError': '이 파일을 해석하지 못했습니다(파서 원문: {{detail}})',
  'cli.eslintError': 'ESLint 가 오류로 멈췄습니다(원문: {{message}})',
  'cli.noProblems': '문제가 없습니다.',
  'cli.summary': '파일 {{files}}개에서 문제 {{count}}건을 찾았습니다.',
  'cli.fixable': '{{count}}건은 `eslint --fix` 로 고칠 수 있습니다.',

  'demo.tsc': 'tsc: {{unit}} {{count}}건',
  'demo.tscUnitOne': '오류',
  'demo.tscUnitMany': '오류',
  'demo.llm': 'llm-call: {{unit}} {{count}}건',
  'demo.problemUnitOne': '문제',
  'demo.problemUnitMany': '문제',
  'demo.file': '{{file}}: {{unit}} {{count}}건',
  'demo.intro': '연습용 데모(목 호출, 실제 API 는 부르지 않음): TypeScript 가 보는 것과 llm-call 이 보는 것.',
};

export const CATALOG: Record<Lang, Record<MessageKey, string>> = { en, ko };

/**
 * Decide the language. Order: explicit flag > LLM_CALL_LINT_LANG > LC_ALL > LC_MESSAGES > LANG.
 * Anything that does not start with "ko" is English.
 */
export function resolveLang(flag?: string, env: Record<string, string | undefined> = process.env): Lang {
  const candidates = [flag, env.LLM_CALL_LINT_LANG, env.LC_ALL, env.LC_MESSAGES, env.LANG];
  const chosen = candidates.find((c) => typeof c === 'string' && c.trim() !== '');
  return chosen && chosen.trim().toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export function isLang(value: string): value is Lang {
  return value === 'en' || value === 'ko';
}

/** Translate a key and fill `{{name}}` placeholders. */
export function t(lang: Lang, key: MessageKey, params: Record<string, string | number> = {}): string {
  return CATALOG[lang][key].replace(/\{\{(\w+)\}\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** ESLint `meta.messages` for one language: `rule.<id>` keys without the prefix (placeholders kept). */
export function ruleMessages(lang: Lang): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, text] of Object.entries(CATALOG[lang])) {
    if (key.startsWith('rule.')) out[key.slice('rule.'.length)] = text;
  }
  return out;
}
