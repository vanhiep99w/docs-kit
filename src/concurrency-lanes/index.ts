import type { Code, Root } from 'mdast';
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx';
import type { Plugin } from 'unified';
import { parseDocument } from 'yaml';
import { visit } from 'unist-util-visit';
import { dataElement } from '../mdx/data-element.js';
import { validateConcurrencyLanes, type ConcurrencyLanesData } from './data.js';

export type { ConcurrencyLanesData, ConcurrencyLane, ConcurrencyEvent, ConcurrencyInterval, ConcurrencyRelation, ConcurrencyLayout, ConcurrencyPosition } from './data.js';

/** Build-time YAML parsing only; this descriptor never executes SQL/Java or verifies causality. */
export function parseConcurrencyLanesDescriptor(source: string): ConcurrencyLanesData {
  if (source.length > 2097152) throw new Error('Concurrency Lanes: descriptor exceeds 2097152 UTF-16 code units.');
  const document = parseDocument(source);
  if (document.errors.length) throw document.errors[0];
  const data: unknown = document.toJS({ maxAliasCount: 100 });
  validateConcurrencyLanes(data);
  return data;
}

export const remarkConcurrencyLanes: Plugin<[], Root> = function () {
  return (tree, file) => {
    const blocks: { node: Code; replace: (node: MdxJsxFlowElement) => void }[] = [];
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'concurrency-lanes' || index === undefined || !parent) return;
      blocks.push({ node, replace: (value) => { parent.children[index] = value; } });
    });
    for (const { node, replace } of blocks) {
      try { replace(dataElement('ConcurrencyLanes', parseConcurrencyLanesDescriptor(node.value), node.position)); }
      catch (error) { file.fail(`Concurrency Lanes failed: ${error instanceof Error ? error.message : String(error)}`, node); }
    }
  };
};
