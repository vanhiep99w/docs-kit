import type { Code, Root } from 'mdast';
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx';
import type { Plugin } from 'unified';
import { parseDocument } from 'yaml';
import { visit } from 'unist-util-visit';
import { dataElement } from '../mdx/data-element.js';
import { highlightCode, type HighlightCodeOptions } from '../code/highlight.js';
import { validateAnnotatedExample, type AnnotatedExampleData } from './data.js';

export type { AnnotatedExampleData, ExampleAnnotation, ExampleRange, ExampleToken } from './data.js';

export type PrepareAnnotatedExampleOptions = HighlightCodeOptions;

/** Build-time only: returns serializable tokens, never raw HTML or executable code. */
export async function prepareAnnotatedExample(
  input: AnnotatedExampleData,
  options: PrepareAnnotatedExampleOptions = {},
): Promise<AnnotatedExampleData> {
  validateAnnotatedExample(input);
  const language = input.language ?? 'text';
  const data: AnnotatedExampleData = { ...input, language, tokens: await highlightCode(input.code, language, options) };
  validateAnnotatedExample(data);
  return data;
}

export type RemarkAnnotatedExampleOptions = PrepareAnnotatedExampleOptions;

/**
 * Compile an `annotated` fence containing a YAML descriptor.
 * Register AnnotatedExample (and optionally AnnotatedExampleWithSource) with MDX.
 */
export const remarkAnnotatedExample: Plugin<[RemarkAnnotatedExampleOptions?], Root> = function (options = {}) {
  return async (tree, file) => {
    const blocks: { node: Code; replace: (node: MdxJsxFlowElement) => void }[] = [];
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'annotated' || index === undefined || !parent) return;
      blocks.push({ node, replace: (value) => { parent.children[index] = value; } });
    });
    for (const { node, replace } of blocks) {
      try {
        const document = parseDocument(node.value);
        if (document.errors.length) throw document.errors[0];
        const input: unknown = document.toJS({ maxAliasCount: 100 });
        validateAnnotatedExample(input);
        // Avoid silently accepting misspelled top-level properties.
        for (const key of Object.keys(input)) {
          if (!['title', 'code', 'language', 'annotations', 'source'].includes(key)) throw new Error(`Unknown property "${key}".`);
        }
        const data = await prepareAnnotatedExample(input, options);
        replace(dataElement(data.source ? 'AnnotatedExampleWithSource' : 'AnnotatedExample', data, node.position));
      } catch (error) {
        file.fail(`Annotated Example failed: ${error instanceof Error ? error.message : String(error)}`, node);
      }
    }
  };
};
