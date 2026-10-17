import type { Code, Root } from 'mdast';
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx';
import type { Plugin } from 'unified';
import { parseDocument } from 'yaml';
import { visit } from 'unist-util-visit';
import { dataElement } from '../mdx/data-element.js';
import { validateTerminalSession, type TerminalSessionData } from './data.js';

export type { TerminalSessionData, TerminalStep, TerminalOutput, TerminalContext } from './data.js';

/** Build-time only. Parse a repository-authored YAML descriptor, without execution. */
export function parseTerminalSession(source: string): TerminalSessionData {
  const document = parseDocument(source);
  if (document.errors.length) throw document.errors[0];
  const data: unknown = document.toJS({ maxAliasCount: 100 });
  validateTerminalSession(data);
  return data;
}

/** Compile a terminal-session fence; register TerminalSession with your MDX components. */
export const remarkTerminalSession: Plugin<[], Root> = function () {
  return (tree, file) => {
    const blocks: { node: Code; replace: (node: MdxJsxFlowElement) => void }[] = [];
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'terminal-session' || index === undefined || !parent) return;
      blocks.push({ node, replace: (value) => { parent.children[index] = value; } });
    });
    for (const { node, replace } of blocks) {
      try {
        replace(dataElement('TerminalSession', parseTerminalSession(node.value), node.position));
      } catch (error) {
        file.fail(`Terminal Session failed: ${error instanceof Error ? error.message : String(error)}`, node);
      }
    }
  };
};
