import type { Code, Root } from 'mdast';
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx';
import type { Plugin } from 'unified';
import { parseDocument } from 'yaml';
import { visit } from 'unist-util-visit';
import { dataElement } from '../mdx/data-element.js';
import { prepareAnnotatedExample, type PrepareAnnotatedExampleOptions } from './index.js';
import { validateCodeWalkthrough, walkthroughExample, type CodeWalkthroughData } from './walkthrough-data.js';

export type { CodeWalkthroughData, WalkthroughSnapshot, WalkthroughStep } from './walkthrough-data.js';
export type PrepareCodeWalkthroughOptions = PrepareAnnotatedExampleOptions;
export type RemarkCodeWalkthroughOptions = PrepareCodeWalkthroughOptions;

/** Build only. Tokenize each snapshot once, not once per step. Never compute or execute changes. */
export async function prepareCodeWalkthrough(input: CodeWalkthroughData, options: PrepareCodeWalkthroughOptions = {}): Promise<CodeWalkthroughData> {
  validateCodeWalkthrough(input);
  const snapshots = [];
  for (const snapshot of input.snapshots) {
    const prepared = await prepareAnnotatedExample(walkthroughExample(input, snapshot), options);
    snapshots.push({ ...snapshot, language: prepared.language, tokens: prepared.tokens });
  }
  const data = { ...input, snapshots };
  validateCodeWalkthrough(data);
  return data;
}

export async function parseCodeWalkthroughDescriptor(source: string, options: PrepareCodeWalkthroughOptions = {}): Promise<CodeWalkthroughData> {
  if (source.length > 2097152) throw new Error('Code Walkthrough: descriptor exceeds 2097152 UTF-16 code units.');
  const document = parseDocument(source);
  if (document.errors.length) throw document.errors[0];
  const input: unknown = document.toJS({ maxAliasCount: 100 });
  validateCodeWalkthrough(input);
  for (const snapshot of input.snapshots) if (Object.hasOwn(snapshot, 'tokens')) throw new Error('Code Walkthrough: tokens are build output, not a descriptor property.');
  return prepareCodeWalkthrough(input, options);
}

export const remarkCodeWalkthrough: Plugin<[RemarkCodeWalkthroughOptions?], Root> = function (options = {}) {
  return async (tree, file) => {
    const blocks: { node: Code; replace: (node: MdxJsxFlowElement) => void }[] = [];
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'code-walkthrough' || index === undefined || !parent) return;
      blocks.push({ node, replace: (value) => { parent.children[index] = value; } });
    });
    for (const { node, replace } of blocks) {
      try {
        const data = await parseCodeWalkthroughDescriptor(node.value, options);
        replace(dataElement(data.snapshots.some((snapshot) => snapshot.source) ? 'CodeWalkthroughWithSource' : 'CodeWalkthrough', data, node.position));
      } catch (error) { file.fail(`Code Walkthrough failed: ${error instanceof Error ? error.message : String(error)}`, node); }
    }
  };
};
