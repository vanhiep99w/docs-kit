import type { Code, Root } from 'mdast';
import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx';
import type { Plugin } from 'unified';
import { parseDocument } from 'yaml';
import { visit } from 'unist-util-visit';
import { dataElement } from '../mdx/data-element.js';
import { prepareJSONPayload } from '../json/prepare.js';
import { validateProtocolExchangeInput, validatePreparedProtocolExchange, type ProtocolBodyInput, type PreparedProtocolBody, type ProtocolExchangeInput, type PreparedProtocolExchange } from './data.js';

export type { ProtocolExchangeInput, PreparedProtocolExchange, ProtocolBodyInput, PreparedProtocolBody, ProtocolHeader, ProtocolRequest, ProtocolResponse, ProtocolVariant, ProtocolAnnotation } from './data.js';

/** Build-only: prepare JSON payloads through the internal lossless JSON pipeline. */
export function prepareProtocolExchange(input: ProtocolExchangeInput): PreparedProtocolExchange {
  validateProtocolExchangeInput(input);
  function body(value: ProtocolBodyInput | undefined, title: string): PreparedProtocolBody | undefined {
    if (value === undefined) return undefined;
    if (value.kind === 'text') return { ...value };
    return { kind: 'json', data: prepareJSONPayload({
      title, json: value.json,
      ...(value.expandedDepth !== undefined ? { expandedDepth: value.expandedDepth } : {}),
      ...(value.annotations ? { annotations: value.annotations } : {}),
    }) };
  }
  const data: PreparedProtocolExchange = { ...input, variants: input.variants.map((variant) => {
    const { body: requestBody, ...request } = variant.request;
    const { body: responseBody, ...response } = variant.response;
    return {
      ...variant,
      request: { ...request, ...(requestBody !== undefined ? { body: body(requestBody, `${variant.title} — Request JSON`)! } : {}) },
      response: { ...response, ...(responseBody !== undefined ? { body: body(responseBody, `${variant.title} — Response JSON`)! } : {}) },
    };
  }) };
  validatePreparedProtocolExchange(data);
  return data;
}

export function parseProtocolExchangeDescriptor(source: string): PreparedProtocolExchange {
  const document = parseDocument(source);
  if (document.errors.length) throw document.errors[0];
  const input: unknown = document.toJS({ maxAliasCount: 100 });
  validateProtocolExchangeInput(input);
  return prepareProtocolExchange(input);
}

export const remarkProtocolExchange: Plugin<[], Root> = function () {
  return (tree, file) => {
    const blocks: { node: Code; replace: (node: MdxJsxFlowElement) => void }[] = [];
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'protocol-exchange' || index === undefined || !parent) return;
      blocks.push({ node, replace: (value) => { parent.children[index] = value; } });
    });
    for (const { node, replace } of blocks) {
      try { replace(dataElement('ProtocolExchange', parseProtocolExchangeDescriptor(node.value), node.position)); }
      catch (error) { file.fail(`Protocol Exchange failed: ${error instanceof Error ? error.message : String(error)}`, node); }
    }
  };
};
