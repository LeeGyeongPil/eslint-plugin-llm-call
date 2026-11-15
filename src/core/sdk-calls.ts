import type { Node, Scope } from './ast.js';

export type Provider = 'openai' | 'anthropic';
export type Api = 'chat' | 'responses' | 'messages';

export interface CallSite {
  provider: Provider;
  api: Api;
  call: Node;
  /** The request object literal (first argument). */
  arg: Node;
  scope: Scope;
}

const SDK_PACKAGES: Record<string, { provider: Provider; exportName: string }> = {
  openai: { provider: 'openai', exportName: 'OpenAI' },
  '@anthropic-ai/sdk': { provider: 'anthropic', exportName: 'Anthropic' },
};

// Method tails that take a request body, per API. `beta.` prefixes are allowed.
const OPENAI_CHAT = ['chat', 'completions'];
const OPENAI_RESPONSES = ['responses'];
const ANTHROPIC_MESSAGES = ['messages'];
const OPENAI_METHODS = new Set(['create', 'parse', 'stream']);
const ANTHROPIC_METHODS = new Set(['create', 'stream']);

interface FileInfo {
  /** constructor local name -> provider */
  ctors: Map<string, Provider>;
  /** client variable (`client`, `this.client`) -> provider */
  clients: Map<string, Provider>;
}

const cache = new WeakMap<object, FileInfo>();

function stringValue(node: Node): string | undefined {
  return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;
}

/** `require('openai')` -> 'openai' (also accepts `.default` / `.OpenAI` style member access on the require call). */
function requireSource(node: Node): { source: string; member?: string } | undefined {
  let cur = node;
  let member: string | undefined;
  if (cur?.type === 'MemberExpression' && !cur.computed && cur.property.type === 'Identifier') {
    member = cur.property.name;
    cur = cur.object;
  }
  if (
    cur?.type === 'CallExpression' &&
    cur.callee.type === 'Identifier' &&
    cur.callee.name === 'require' &&
    cur.arguments.length === 1
  ) {
    const source = stringValue(cur.arguments[0]);
    if (source) return { source, member };
  }
  return undefined;
}

function collectCtors(program: Node): Map<string, Provider> {
  const ctors = new Map<string, Provider>();
  const walk = (body: Node[]): void => {
    for (const node of body) {
      if (node.type === 'ImportDeclaration') {
        const pkg = SDK_PACKAGES[String(node.source.value)];
        if (!pkg) continue;
        for (const s of node.specifiers) {
          if (s.type === 'ImportDefaultSpecifier') ctors.set(s.local.name, pkg.provider);
          if (s.type === 'ImportSpecifier' && s.imported.name === pkg.exportName) ctors.set(s.local.name, pkg.provider);
        }
      } else if (node.type === 'VariableDeclaration') {
        for (const d of node.declarations) {
          const req = d.init ? requireSource(d.init) : undefined;
          const pkg = req ? SDK_PACKAGES[req.source] : undefined;
          if (!req || !pkg) continue;
          if (d.id.type === 'Identifier' && (req.member === undefined || req.member === 'default' || req.member === pkg.exportName)) {
            ctors.set(d.id.name, pkg.provider);
          } else if (d.id.type === 'ObjectPattern' && req.member === undefined) {
            for (const p of d.id.properties) {
              if (p.type === 'Property' && p.key.type === 'Identifier' && p.key.name === pkg.exportName && p.value.type === 'Identifier') {
                ctors.set(p.value.name, pkg.provider);
              }
            }
          }
        }
      }
    }
  };
  walk(program.body);
  return ctors;
}

/** Name used to key a client: `client` or `this.client`. */
function clientKey(node: Node): string | undefined {
  if (node?.type === 'Identifier') return node.name;
  if (
    node?.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'ThisExpression' &&
    node.property.type === 'Identifier'
  ) {
    return `this.${node.property.name}`;
  }
  if (node?.type === 'PropertyDefinition' && !node.computed && node.key.type === 'Identifier') {
    return `this.${node.key.name}`;
  }
  return undefined;
}

function newExprProvider(init: Node, ctors: Map<string, Provider>): Provider | undefined {
  if (init?.type === 'NewExpression' && init.callee.type === 'Identifier') return ctors.get(init.callee.name);
  return undefined;
}

function collectClients(root: Node, ctors: Map<string, Provider>, visitorKeys: Record<string, readonly string[]>): Map<string, Provider> {
  const clients = new Map<string, Provider>();
  const visit = (n: Node): void => {
    if (!n || typeof n.type !== 'string') return;
    let key: string | undefined;
    let init: Node;
    if (n.type === 'VariableDeclarator') {
      key = clientKey(n.id);
      init = n.init;
    } else if (n.type === 'PropertyDefinition') {
      key = clientKey(n);
      init = n.value;
    } else if (n.type === 'AssignmentExpression' && n.operator === '=') {
      key = clientKey(n.left);
      init = n.right;
    }
    if (key && init) {
      const provider = newExprProvider(init, ctors);
      if (provider) clients.set(key, provider);
    }
    const keys = visitorKeys[n.type] ?? Object.keys(n).filter((k) => k !== 'parent');
    for (const k of keys) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v.type === 'string') visit(v);
    }
  };
  visit(root);
  return clients;
}

/** Member path of a callee: `a.b.c` -> root node + names. Root may be an identifier, `this.x`, or a `new X()` expression. */
function calleeParts(callee: Node): { root: Node; names: string[] } | undefined {
  const names: string[] = [];
  let cur = callee;
  while (cur.type === 'MemberExpression' && !cur.computed && cur.property.type === 'Identifier') {
    names.unshift(cur.property.name);
    cur = cur.object;
  }
  if (cur === callee) return undefined;
  return { root: cur, names };
}

function matchTail(names: string[], provider: Provider): { api: Api; rootLen: number } | undefined {
  const methods = provider === 'openai' ? OPENAI_METHODS : ANTHROPIC_METHODS;
  const method = names[names.length - 1];
  if (!method || !methods.has(method)) return undefined;
  const path = names.slice(0, -1);
  const endsWith = (tail: string[]): boolean =>
    path.length >= tail.length && tail.every((t, i) => path[path.length - tail.length + i] === t);
  const strip = (tail: string[]): number => {
    // allow one optional `beta` segment between the client and the API segment
    const rest = path.slice(0, path.length - tail.length);
    return rest.length > 0 && rest[rest.length - 1] === 'beta' ? rest.length - 1 : rest.length;
  };
  if (provider === 'openai') {
    if (endsWith(OPENAI_CHAT)) return { api: 'chat', rootLen: strip(OPENAI_CHAT) };
    if (endsWith(OPENAI_RESPONSES)) return { api: 'responses', rootLen: strip(OPENAI_RESPONSES) };
  } else if (endsWith(ANTHROPIC_MESSAGES)) {
    return { api: 'messages', rootLen: strip(ANTHROPIC_MESSAGES) };
  }
  return undefined;
}

export interface SourceLike {
  ast: Node;
  visitorKeys: Record<string, readonly string[]>;
}

function fileInfo(source: SourceLike): FileInfo {
  let info = cache.get(source.ast);
  if (!info) {
    const ctors = collectCtors(source.ast);
    const clients = ctors.size > 0 ? collectClients(source.ast, ctors, source.visitorKeys) : new Map<string, Provider>();
    info = { ctors, clients };
    cache.set(source.ast, info);
  }
  return info;
}

/**
 * True when the identifier resolves to a variable that is not an SDK client: a parameter, an import
 * from elsewhere, or a local declaration initialised with something other than `new <SDK ctor>()`.
 * A declaration without an initialiser (`let c; c = new OpenAI()`) is still trusted.
 */
function isShadowed(scope: Scope, name: string, ctors: Map<string, Provider>): boolean {
  let cur = scope;
  while (cur) {
    const variable = cur.set?.get(name);
    if (variable) {
      if (variable.defs.length === 0) return false; // implicit global: keep the file-level answer
      return !variable.defs.every(
        (d: Node) =>
          d.type === 'Variable' &&
          d.node.id.type === 'Identifier' &&
          (!d.node.init || newExprProvider(d.node.init, ctors) !== undefined),
      );
    }
    cur = cur.upper;
  }
  return false;
}

/**
 * Identify an SDK request call. Returns undefined unless the callee provably starts from a client
 * created with `new OpenAI()` / `new Anthropic()` imported from the official package in this file.
 */
export function matchCall(source: SourceLike, call: Node, scope: Scope): CallSite | undefined {
  if (call.type !== 'CallExpression' || call.callee.type !== 'MemberExpression') return undefined;
  const info = fileInfo(source);
  if (info.ctors.size === 0) return undefined;
  const parts = calleeParts(call.callee);
  if (!parts) return undefined;

  let provider: Provider | undefined;
  let api: Api | undefined;

  if (parts.root.type === 'NewExpression') {
    provider = newExprProvider(parts.root, info.ctors);
    if (!provider) return undefined;
    const m = matchTail(parts.names, provider);
    if (!m || m.rootLen !== 0) return undefined;
    api = m.api;
  } else {
    // `client.chat.completions.create` or `this.client.chat...`
    const root = parts.root.type === 'ThisExpression' ? parts.names[0] : undefined;
    if (parts.root.type === 'ThisExpression') {
      if (!root) return undefined;
      provider = info.clients.get(`this.${root}`);
      if (!provider) return undefined;
      const m = matchTail(parts.names, provider);
      if (!m || m.rootLen !== 1) return undefined;
      api = m.api;
    } else if (parts.root.type === 'Identifier') {
      provider = info.clients.get(parts.root.name as string);
      if (!provider) return undefined;
      if (isShadowed(scope, parts.root.name as string, info.ctors)) return undefined;
      const m = matchTail(parts.names, provider);
      if (!m || m.rootLen !== 0) return undefined;
      api = m.api;
    } else {
      return undefined;
    }
  }

  const arg = call.arguments[0];
  if (!arg || arg.type !== 'ObjectExpression') return undefined;
  return { provider, api, call, arg, scope };
}
