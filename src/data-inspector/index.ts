import type { Code, Root } from 'mdast';
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx';
import type { Plugin } from 'unified';
import { parseDocument } from 'yaml';
import { parseTree, printParseErrorCode, type Node, type ParseError } from 'jsonc-parser';
import { visit } from 'unist-util-visit';
import { dataElement } from '../mdx/data-element.js';
import { encodeJSONPointer, validateDataInspectorInput, validatePreparedDataInspector, type DataInspectorInput, type InspectorNode, type InspectorNodeType, type PreparedDataInspector } from './data.js';

export type { DataInspectorInput, PreparedDataInspector, InspectorNode, InspectorNodeType, InspectorAnnotation } from './data.js';

function depthBudget(source: string) {
  let depth = 0; let quoted = false; let escaped = false;
  for (const character of source) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{' || character === '[') {
      depth++;
      if (depth > 33) throw new Error('Data Inspector: JSON exceeds 32 levels of nesting.');
    } else if (character === '}' || character === ']') depth--;
  }
}

/** Strict, lossless source indexing. Never serializes the parser's numeric .value. */
export function prepareDataInspector(input: DataInspectorInput): PreparedDataInspector {
  validateDataInspectorInput(input);
  depthBudget(input.json);
  const errors: ParseError[] = [];
  const root = parseTree(input.json, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
  if (errors.length || !root) {
    const error = errors[0];
    throw new Error(`Data Inspector: invalid JSON${error ? ` (${printParseErrorCode(error.error)}, offset ${error.offset})` : ''}.`);
  }
  const nodes: InspectorNode[] = [];
  function walk(node: Node, segments: string[], key: string) {
    if (segments.length > 32 || nodes.length >= 1024) throw new Error('Data Inspector: JSON exceeds 32 nesting levels or 1024 value nodes.');
    const pointer = encodeJSONPointer(segments);
    const entry: InspectorNode = { pointer, key, type: node.type as InspectorNodeType, offset: node.offset, length: node.length, children: [] };
    nodes.push(entry);
    if (node.type === 'object') {
      const keys = new Set<string>();
      for (const property of node.children ?? []) {
        const name = property.children?.[0].value as string;
        if (keys.has(name)) throw new Error(`Data Inspector: duplicate object key ${JSON.stringify(name)} at ${pointer || '(root)'}.`);
        keys.add(name);
        entry.children.push(encodeJSONPointer([...segments, name]));
        walk(property.children![1], [...segments, name], name);
      }
    } else if (node.type === 'array') {
      (node.children ?? []).forEach((child, index) => {
        const name = String(index);
        entry.children.push(encodeJSONPointer([...segments, name]));
        walk(child, [...segments, name], name);
      });
    }
  }
  walk(root, [], '(root)');
  const data: PreparedDataInspector = { ...input, expandedDepth: input.expandedDepth ?? 1, nodes };
  validatePreparedDataInspector(data);
  return data;
}

export function parseDataInspectorDescriptor(source: string): PreparedDataInspector {
  const document = parseDocument(source);
  if (document.errors.length) throw document.errors[0];
  const input: unknown = document.toJS({ maxAliasCount: 100 });
  validateDataInspectorInput(input);
  return prepareDataInspector(input);
}

export const remarkDataInspector: Plugin<[], Root> = function () {
  return (tree, file) => {
    const blocks: { node: Code; replace: (node: MdxJsxFlowElement) => void }[] = [];
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'data-inspector' || index === undefined || !parent) return;
      blocks.push({ node, replace: (value) => { parent.children[index] = value; } });
    });
    for (const { node, replace } of blocks) {
      try { replace(dataElement('DataInspector', parseDataInspectorDescriptor(node.value), node.position)); }
      catch (error) { file.fail(`Data Inspector failed: ${error instanceof Error ? error.message : String(error)}`, node); }
    }
  };
};
