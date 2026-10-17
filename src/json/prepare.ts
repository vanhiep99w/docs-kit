import { parseTree, printParseErrorCode, type Node, type ParseError } from 'jsonc-parser';
import { encodeJSONPointer, validateJSONPayloadInput, validatePreparedJSONPayload, type JSONPayloadInput, type JSONNode, type JSONNodeType, type PreparedJSONPayload } from './data.js';

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
      if (depth > 33) throw new Error('JSON payload: JSON exceeds 32 levels of nesting.');
    } else if (character === '}' || character === ']') depth--;
  }
}

/** Strict, lossless source indexing. Never serializes the parser's numeric .value. */
export function prepareJSONPayload(input: JSONPayloadInput): PreparedJSONPayload {
  validateJSONPayloadInput(input);
  depthBudget(input.json);
  const errors: ParseError[] = [];
  const root = parseTree(input.json, errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false });
  if (errors.length || !root) {
    const error = errors[0];
    throw new Error(`JSON payload: invalid JSON${error ? ` (${printParseErrorCode(error.error)}, offset ${error.offset})` : ''}.`);
  }
  const nodes: JSONNode[] = [];
  function walk(node: Node, segments: string[], key: string) {
    if (segments.length > 32 || nodes.length >= 1024) throw new Error('JSON payload: JSON exceeds 32 nesting levels or 1024 value nodes.');
    const pointer = encodeJSONPointer(segments);
    const entry: JSONNode = { pointer, key, type: node.type as JSONNodeType, offset: node.offset, length: node.length, children: [] };
    nodes.push(entry);
    if (node.type === 'object') {
      const keys = new Set<string>();
      for (const property of node.children ?? []) {
        const name = property.children?.[0].value as string;
        if (keys.has(name)) throw new Error(`JSON payload: duplicate object key ${JSON.stringify(name)} at ${pointer || '(root)'}.`);
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
  const data: PreparedJSONPayload = { ...input, expandedDepth: input.expandedDepth ?? 1, nodes };
  validatePreparedJSONPayload(data);
  return data;
}
