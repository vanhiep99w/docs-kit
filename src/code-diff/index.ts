import type { Code, Root } from 'mdast';
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx';
import type { Plugin } from 'unified';
import { parseDocument } from 'yaml';
import { visit } from 'unist-util-visit';
import { highlightCode, type HighlightCodeOptions } from '../code/highlight.js';
import { dataElement } from '../mdx/data-element.js';
import { buildDiffRows } from './diff.js';
import { addWordRanges } from './word-diff.js';
import { validateCodeDiffInput, validatePreparedCodeDiff, type CodeDiffInput, type PreparedCodeDiff } from './data.js';

export type { CodeDiffInput, PreparedCodeDiff, CodeDiffFile, DiffRow, DiffAnnotation, DiffSide, DiffView, DiffWordRange, DiffSplitRow } from './data.js';
export type PrepareCodeDiffOptions = HighlightCodeOptions & { highlight?: boolean };

export async function prepareCodeDiff(input: CodeDiffInput, options: PrepareCodeDiffOptions = {}): Promise<PreparedCodeDiff> {
  validateCodeDiffInput(input);
  if (options.highlight !== undefined && typeof options.highlight !== 'boolean') throw new Error('Code Diff: highlight must be boolean.');
  const lineRows = buildDiffRows(input.before.code, input.after.code);
  const rows = input.wordDiff ? addWordRanges(lineRows, input.before.code, input.after.code) : lineRows;
  const [beforeTokens, afterTokens] = options.highlight === false
    ? [input.before.tokens, input.after.tokens]
    : await Promise.all([
      highlightCode(input.before.code, input.language ?? 'text', options),
      highlightCode(input.after.code, input.language ?? 'text', options),
    ]);
  const data: PreparedCodeDiff = {
    ...input,
    language: input.language ?? 'text',
    contextLines: input.contextLines ?? 3,
    before: { ...input.before, ...(beforeTokens ? { tokens: beforeTokens } : {}) },
    after: { ...input.after, ...(afterTokens ? { tokens: afterTokens } : {}) },
    rows,
  };
  validatePreparedCodeDiff(data);
  return data;
}

export async function parseCodeDiffDescriptor(source: string, options: PrepareCodeDiffOptions = {}): Promise<PreparedCodeDiff> {
  const document = parseDocument(source);
  if (document.errors.length) throw document.errors[0];
  const input: unknown = document.toJS({ maxAliasCount: 100 });
  validateCodeDiffInput(input);
  return prepareCodeDiff(input, options);
}

export const remarkCodeDiff: Plugin<[PrepareCodeDiffOptions?], Root> = function (options = {}) {
  return async (tree, file) => {
    const blocks: { node: Code; replace: (node: MdxJsxFlowElement) => void }[] = [];
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'code-diff' || index === undefined || !parent) return;
      blocks.push({ node, replace: (value) => { parent.children[index] = value; } });
    });
    for (const { node, replace } of blocks) {
      try {
        const data = await parseCodeDiffDescriptor(node.value, options);
        replace(dataElement(data.before.source || data.after.source ? 'CodeDiffWithSource' : 'CodeDiff', data, node.position));
      } catch (error) {
        file.fail(`Code Diff failed: ${error instanceof Error ? error.message : String(error)}`, node);
      }
    }
  };
};
