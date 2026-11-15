// Minimal AST aliases. The rules only read ESTree-shaped nodes (espree and
// typescript-eslint produce the same shape for the parts we inspect), so a loose
// node type keeps the code readable without pulling in parser-specific types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Node = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Scope = any;
