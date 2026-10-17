import type { Code, Root } from 'mdast';
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx';
import type { Plugin } from 'unified';
import { parseDocument } from 'yaml';
import { visit } from 'unist-util-visit';
import { dataElement } from '../mdx/data-element.js';
import { validateStateTransition, type StateTransitionData } from './data.js';

export type { StateTransitionData, ExplorerState, ExplorerTransition, StateTransitionTrace, TransitionTraceEntry } from './data.js';

/** Build-only descriptor parsing. Never evaluates guards, actions or JavaScript expressions. */
export function parseStateTransitionDescriptor(source: string): StateTransitionData {
  if (source.length > 2097152) throw new Error('State Transition: descriptor exceeds 2097152 UTF-16 code units.');
  const document = parseDocument(source);
  if (document.errors.length) throw document.errors[0];
  const data: unknown = document.toJS({ maxAliasCount: 100 });
  validateStateTransition(data);
  return data;
}

export const remarkStateTransition: Plugin<[], Root> = function () {
  return (tree, file) => {
    const blocks: { node: Code; replace: (node: MdxJsxFlowElement) => void }[] = [];
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'state-transition' || index === undefined || !parent) return;
      blocks.push({ node, replace: (value) => { parent.children[index] = value; } });
    });
    for (const { node, replace } of blocks) {
      try { replace(dataElement('StateTransitionExplorer', parseStateTransitionDescriptor(node.value), node.position)); }
      catch (error) { file.fail(`State Transition failed: ${error instanceof Error ? error.message : String(error)}`, node); }
    }
  };
};
