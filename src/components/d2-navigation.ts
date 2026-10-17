/** D2 emits unquoted names with spaces in internal hrefs, but quotes literal dots. */
export function normalizeD2BoardLink(href: string): string | undefined {
  const path = href === 'root' ? '' : href.startsWith('root.') ? href.slice(5) : href;
  try {
    const tokens = path.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^.]+/g) ?? [];
    return tokens.map((token) => {
      const value: string = token.startsWith('"') ? JSON.parse(token) : token.startsWith("'") ? token.slice(1, -1) : token;
      return /^[\w-]+$/.test(value) ? value : JSON.stringify(value);
    }).join('.');
  } catch { return undefined; }
}
