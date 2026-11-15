import type { Node, Scope } from './ast.js';

/**
 * Static value resolution. The plugin only trusts what it can read from the same file:
 * literals, template literals without expressions, same-file `const` identifiers and
 * spreads of same-file `const` object literals. Everything else is "unknown" and the
 * rules stay silent (a missed bug is cheaper than a false alarm).
 */

export const UNKNOWN = Symbol('unknown');
export type Primitive = string | number | boolean | null;
export type StaticValue = Primitive | typeof UNKNOWN;

const MAX_DEPTH = 8;

/** Strip wrappers that do not change the value: `x as const`, `x satisfies T`, `(x)`, `x!`. */
export function unwrap(node: Node): Node {
  let cur = node;
  while (cur) {
    if (cur.type === 'TSSatisfiesExpression' || cur.type === 'TSNonNullExpression') {
      cur = cur.expression;
    } else if (
      cur.type === 'TSAsExpression' &&
      cur.typeAnnotation?.type === 'TSTypeReference' &&
      cur.typeAnnotation.typeName?.name === 'const'
    ) {
      cur = cur.expression;
    } else {
      return cur;
    }
  }
  return cur;
}

export interface Resolved {
  node: Node;
  scope: Scope;
}

/** Follow a same-file `const` identifier to its initializer. Returns undefined when unknown. */
export function resolve(scope: Scope, node: Node, depth = 0): Resolved | undefined {
  if (!node || depth > MAX_DEPTH) return undefined;
  const n = unwrap(node);
  if (n.type !== 'Identifier') return { node: n, scope };
  let s: Scope | null = scope;
  while (s) {
    const variable = s.set.get(n.name);
    if (variable) {
      const def = variable.defs[0];
      if (
        def &&
        def.type === 'Variable' &&
        def.node.type === 'VariableDeclarator' &&
        def.node.id.type === 'Identifier' &&
        def.parent?.kind === 'const' &&
        def.node.init
      ) {
        return resolve(variable.scope, def.node.init, depth + 1);
      }
      return undefined;
    }
    s = s.upper;
  }
  return undefined;
}

/** Literal string / number / boolean / null, or UNKNOWN. */
export function staticValue(scope: Scope, node: Node): StaticValue {
  const r = resolve(scope, node);
  if (!r) return UNKNOWN;
  const n = r.node;
  if (n.type === 'Literal' && !n.regex && typeof n.bigint !== 'string') {
    const v = n.value;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) return v;
    return UNKNOWN;
  }
  if (n.type === 'TemplateLiteral' && n.expressions.length === 0 && n.quasis.length === 1) {
    return n.quasis[0].value.cooked ?? UNKNOWN;
  }
  return UNKNOWN;
}

export function staticString(scope: Scope, node: Node): string | undefined {
  const v = staticValue(scope, node);
  return typeof v === 'string' ? v : undefined;
}

export interface PropEntry {
  name: string;
  /** Node to underline: the key for a direct property, the spread element for a spread-in property. */
  reportNode: Node;
  valueNode: Node;
  /** Scope in which `valueNode` identifiers must be resolved. */
  scope: Scope;
  /** The Property node when written directly in this object (enables autofix); undefined for spread-in. */
  property?: Node;
}

export interface ObjectView {
  node: Node;
  props: Map<string, PropEntry>;
  /** False when a spread or computed key could not be read, so absent keys might still exist. */
  complete: boolean;
  /** True when the object literal itself contains any spread element. */
  hasSpread: boolean;
}

/** Read an object literal (following const identifiers and const-object spreads). */
export function objectView(scope: Scope, node: Node, depth = 0): ObjectView | undefined {
  const r = resolve(scope, node);
  if (!r || r.node.type !== 'ObjectExpression') return undefined;
  const view: ObjectView = { node: r.node, props: new Map(), complete: true, hasSpread: false };
  fill(view, r.scope, r.node, undefined, depth);
  return view;
}

function fill(view: ObjectView, scope: Scope, obj: Node, spreadNode: Node | undefined, depth: number): void {
  for (const p of obj.properties) {
    if (p.type === 'SpreadElement') {
      if (!spreadNode) view.hasSpread = true;
      const inner = depth < MAX_DEPTH ? resolve(scope, p.argument) : undefined;
      if (inner && inner.node.type === 'ObjectExpression') {
        fill(view, inner.scope, inner.node, spreadNode ?? p, depth + 1);
      } else {
        view.complete = false;
      }
      continue;
    }
    if (p.type !== 'Property') {
      view.complete = false;
      continue;
    }
    const name = propertyName(scope, p);
    if (name === undefined) {
      view.complete = false;
      continue;
    }
    view.props.set(name, {
      name,
      reportNode: spreadNode ? spreadNode : p.key,
      valueNode: p.value,
      scope,
      property: spreadNode ? undefined : p,
    });
  }
}

function propertyName(scope: Scope, p: Node): string | undefined {
  if (!p.computed) {
    if (p.key.type === 'Identifier') return p.key.name;
    if (p.key.type === 'Literal') return String(p.key.value);
    return undefined;
  }
  return staticString(scope, p.key);
}

/** View of an object-valued property: `getObject(view, 'response_format')`. */
export function childObject(view: ObjectView | undefined, name: string): ObjectView | undefined {
  const entry = view?.props.get(name);
  return entry ? objectView(entry.scope, entry.valueNode) : undefined;
}

export function childValue(view: ObjectView | undefined, name: string): StaticValue | undefined {
  const entry = view?.props.get(name);
  return entry ? staticValue(entry.scope, entry.valueNode) : undefined;
}
