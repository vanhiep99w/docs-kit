import type { MdxJsxFlowElement } from 'mdast-util-mdx-jsx';
import type { Position } from 'unist';

/** Serialize validated data as a literal, never as author-supplied JavaScript. */
export function dataElement(name: string, data: unknown, position?: Position): MdxJsxFlowElement {
  const serialized = JSON.stringify(data);
  return {
    type: 'mdxJsxFlowElement',
    name,
    attributes: [{
      type: 'mdxJsxAttribute',
      name: 'data',
      value: {
        type: 'mdxJsxAttributeValueExpression',
        value: `JSON.parse(${JSON.stringify(serialized)})`,
        data: { estree: {
          type: 'Program', sourceType: 'module',
          body: [{ type: 'ExpressionStatement', expression: {
            type: 'CallExpression', optional: false,
            callee: { type: 'MemberExpression', computed: false, optional: false, object: { type: 'Identifier', name: 'JSON' }, property: { type: 'Identifier', name: 'parse' } },
            arguments: [{ type: 'Literal', value: serialized }],
          } }],
        } },
      },
    }],
    children: [],
    position,
  };
}
