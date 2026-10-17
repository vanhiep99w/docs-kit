import type { Code, Root } from 'mdast';
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx';
import type { Plugin } from 'unified';
import { parseDocument } from 'yaml';
import { visit } from 'unist-util-visit';
import { dataElement } from '../mdx/data-element.js';
import { validateMarbleDiagram, type MarbleDiagramData } from './data.js';

export type { MarbleDiagramData, MarbleRow, MarbleAnnotation, MarbleToken, MarbleTokenType } from './data.js';

/** Build-time YAML descriptor, not an RxJS execution or TestScheduler assertion. */
export function parseMarbleDescriptor(source: string): MarbleDiagramData {
  const document = parseDocument(source);
  if (document.errors.length) throw document.errors[0];
  const data: unknown = document.toJS({ maxAliasCount: 100 });
  validateMarbleDiagram(data);
  return data;
}

export const remarkMarble: Plugin<[], Root> = function () {
  return (tree, file) => {
    const blocks: { node: Code; replace: (node: MdxJsxFlowElement) => void }[] = [];
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'marble' || index === undefined || !parent) return;
      blocks.push({ node, replace: (value) => { parent.children[index] = value; } });
    });
    for (const { node, replace } of blocks) {
      try {
        const data = parseMarbleDescriptor(node.value);
        replace(dataElement(data.zoom ? 'MarbleZoomDiagram' : 'MarbleDiagram', data, node.position));
      }
      catch (error) { file.fail(`Marble Diagram failed: ${error instanceof Error ? error.message : String(error)}`, node); }
    }
  };
};
