import { validateSourceRequest, type SourceRequest } from '../source-explorer/index.js';

import { codeLines, validateAnnotations, type ExampleAnnotation } from '../code/annotations.js';
export { codeLines } from '../code/annotations.js';
export type { ExampleRange, ExampleAnnotation } from '../code/annotations.js';

import { validateCodeTokens, type ExampleToken } from '../code/tokens.js';
export type { ExampleToken } from '../code/tokens.js';

export type AnnotatedExampleData = {
  title: string;
  code: string;
  language?: string;
  annotations: ExampleAnnotation[];
  source?: SourceRequest;
  /** Prepared at build time. Omit for escaped, unhighlighted code. */
  tokens?: ExampleToken[][];
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim();
}

function fail(message: string): never {
  throw new Error(`Annotated Example: ${message}`);
}

/** Shared validation for build tools and direct React usage. No browser/Node APIs. */
export function validateAnnotatedExample(value: unknown): asserts value is AnnotatedExampleData {
  if (!record(value)) fail('expected an object.');
  if (!nonempty(value.title)) fail('title must be a non-empty string.');
  if (typeof value.code !== 'string') fail('code must be a string.');
  if (value.language !== undefined && !nonempty(value.language)) fail('language must be a non-empty string.');
  const lines = codeLines(value.code);
  try { validateAnnotations(value.annotations, lines.length); }
  catch (error) { fail(error instanceof Error ? error.message : String(error)); }
  if (value.source !== undefined) {
    try { validateSourceRequest(value.source); }
    catch (error) { fail(error instanceof Error ? error.message : String(error)); }
  }
  try { validateCodeTokens(value.tokens, lines); }
  catch (error) { fail(error instanceof Error ? error.message : String(error)); }
}
