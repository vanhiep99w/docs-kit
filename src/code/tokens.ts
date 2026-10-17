export type ExampleToken = {
  content: string;
  light?: string;
  dark?: string;
  /** Shiki bitmask: italic=1, bold=2, underline=4. */
  fontStyle?: number;
  darkFontStyle?: number;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function fail(message: string): never { throw new Error(message); }

/** No HTML: token text must reconstruct each displayed line exactly. */
export function validateCodeTokens(tokens: unknown, lines: string[]): asserts tokens is ExampleToken[][] | undefined {
  if (tokens !== undefined) {
    if (!Array.isArray(tokens) || tokens.length !== lines.length) fail('tokens must match the displayed line count.');
    for (const [index, line] of tokens.entries()) {
      if (!Array.isArray(line)) fail('each token line must be an array.');
      for (const token of line) {
        if (!record(token) || typeof token.content !== 'string') fail('token content must be a string.');
        for (const theme of ['light', 'dark']) {
          if (token[theme] !== undefined && (typeof token[theme] !== 'string' || !/^#[\da-f]{3,8}$/i.test(token[theme] as string) ||
              ![4, 5, 7, 9].includes((token[theme] as string).length))) fail('token colors must be hexadecimal CSS colors.');
        }
        for (const key of ['fontStyle', 'darkFontStyle']) {
          if (token[key] !== undefined && (!Number.isInteger(token[key]) || (token[key] as number) < 0 || (token[key] as number) > 7)) {
            fail('token fontStyle must be a bitmask from 0 to 7.');
          }
        }
      }
      if (line.map((token: ExampleToken) => token.content).join('') !== lines[index]) fail(`tokens do not match code at line ${index + 1}.`);
    }
  }
}
