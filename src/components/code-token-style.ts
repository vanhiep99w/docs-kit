import type { CSSProperties } from 'react';
import type { ExampleToken } from '../code/tokens.js';

export function codeTokenStyle(token: ExampleToken, prefix: 'annotated' | 'code-diff'): CSSProperties {
  const light = token.fontStyle ?? 0;
  const dark = token.darkFontStyle ?? light;
  return {
    [`--${prefix}-token-light`]: token.light,
    [`--${prefix}-token-dark`]: token.dark ?? token.light,
    ...(light || dark ? {
      [`--${prefix}-italic-light`]: light & 1 ? 'italic' : 'normal',
      [`--${prefix}-italic-dark`]: dark & 1 ? 'italic' : 'normal',
      [`--${prefix}-weight-light`]: light & 2 ? 'bold' : 'normal',
      [`--${prefix}-weight-dark`]: dark & 2 ? 'bold' : 'normal',
      [`--${prefix}-decoration-light`]: light & 4 ? 'underline' : 'none',
      [`--${prefix}-decoration-dark`]: dark & 4 ? 'underline' : 'none',
    } : {}),
  } as CSSProperties;
}
