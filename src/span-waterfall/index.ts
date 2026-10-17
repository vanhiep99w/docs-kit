import type { Code, Root } from 'mdast';
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx';
import type { Plugin } from 'unified';
import { parseDocument } from 'yaml';
import { visit } from 'unist-util-visit';
import { dataElement } from '../mdx/data-element.js';
import { prepareJSONPayload } from '../json/prepare.js';
import { validateSpanWaterfallInput, validatePreparedSpanWaterfall, type SpanWaterfallInput, type PreparedSpanWaterfall } from './data.js';

export type { SpanWaterfallInput, PreparedSpanWaterfall, WaterfallSpan, SpanAnnotation, WaterfallRow } from './data.js';

/** Build only. Attribute sources are never converted to JavaScript numbers. */
export function prepareSpanWaterfall(input: SpanWaterfallInput): PreparedSpanWaterfall {
  validateSpanWaterfallInput(input);
  const data: PreparedSpanWaterfall = { ...input, spans: input.spans.map(({ attributes, ...span }) => ({
    ...span,
    ...(attributes !== undefined ? { attributes: prepareJSONPayload({ title: 'Attributes', json: attributes }) } : {}),
  })) };
  validatePreparedSpanWaterfall(data);
  return data;
}

export function parseSpanWaterfallDescriptor(source: string): PreparedSpanWaterfall {
  if (source.length > 2097152) throw new Error('Span Waterfall: descriptor exceeds 2097152 UTF-16 code units.');
  const document = parseDocument(source);
  if (document.errors.length) throw document.errors[0];
  const input: unknown = document.toJS({ maxAliasCount: 100 });
  validateSpanWaterfallInput(input);
  return prepareSpanWaterfall(input);
}

export const remarkSpanWaterfall: Plugin<[], Root> = function () {
  return (tree, file) => {
    const blocks: { node: Code; replace: (node: MdxJsxFlowElement) => void }[] = [];
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'span-waterfall' || index === undefined || !parent) return;
      blocks.push({ node, replace: (value) => { parent.children[index] = value; } });
    });
    for (const { node, replace } of blocks) {
      try { replace(dataElement('SpanWaterfall', parseSpanWaterfallDescriptor(node.value), node.position)); }
      catch (error) { file.fail(`Span Waterfall failed: ${error instanceof Error ? error.message : String(error)}`, node); }
    }
  };
};
