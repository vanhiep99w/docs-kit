import { bundledLanguages, bundledThemes, codeToTokensWithThemes, type BundledLanguage, type BundledTheme } from 'shiki';
import { codeLines } from './annotations.js';
import { validateCodeTokens, type ExampleToken } from './tokens.js';

export type HighlightCodeOptions = { themes?: { light?: string; dark?: string } };

/** Build-time only. Tokenize complete files before selecting individual diff lines. */
export async function highlightCode(code: string, language = 'text', options: HighlightCodeOptions = {}): Promise<ExampleToken[][]> {
  if (!['text', 'txt', 'plain', 'plaintext'].includes(language) && !Object.hasOwn(bundledLanguages, language)) {
    throw new Error(`Code highlight: unsupported language "${language}".`);
  }
  const light = options.themes?.light ?? 'github-light';
  const dark = options.themes?.dark ?? 'github-dark';
  for (const theme of [light, dark]) {
    if (!Object.hasOwn(bundledThemes, theme)) throw new Error(`Code highlight: unsupported theme "${theme}".`);
  }
  const result = await codeToTokensWithThemes(codeLines(code).join('\n'), {
    lang: language as BundledLanguage,
    themes: { light: light as BundledTheme, dark: dark as BundledTheme },
  });
  const tokens = result.map((line) => line.map((token) => ({
    content: token.content,
    light: token.variants.light.color,
    dark: token.variants.dark.color,
    fontStyle: Math.max(0, token.variants.light.fontStyle ?? 0),
    darkFontStyle: Math.max(0, token.variants.dark.fontStyle ?? 0),
  })));
  validateCodeTokens(tokens, codeLines(code));
  return tokens;
}
