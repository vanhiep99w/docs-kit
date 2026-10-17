import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { prepareJSONPayload } from '../dist/json/prepare.js';
import { formatJSONPayload, validatePreparedJSONPayload } from '../dist/json/data.js';

// Internal shared parser, not a public Inspector component or package entrypoint.
test('JSON display is readable without rounding or rewriting scalar lexemes; copy source stays exact', () => {
  const json = ' \r\n{"id":9007199254740993,"huge":1e309,"n":-0,"exp":1.20e+02,"name":"xin chào 👋","a/b":{"~":[true,null,{},[]]}}\r\n';
  const data = prepareJSONPayload({ title: 'Payload', json });
  const display = formatJSONPayload(data);
  assert.equal(data.json, json);
  for (const value of ['9007199254740993', '1e309', '-0', '1.20e+02', 'xin chào 👋']) assert.ok(display.includes(value));
  assert.match(display, /\n  "a\/b": \{\n    "~": \[/);
  assert.equal(formatJSONPayload(prepareJSONPayload({ title: 'Scalar', json: ' \r\n1e309 ' })), '1e309');
  for (const json of ['[]', '{}', 'true', 'null', '"</script><img src=x>"']) {
    assert.equal(formatJSONPayload(prepareJSONPayload({ title: 'JSON', json })), json);
  }
});

test('strict JSON rejects comments, duplicate decoded keys, invalid syntax, excess depth and node budgets', () => {
  for (const json of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"a":1,}', '{} // comment', '[undefined]', '{broken}']) {
    assert.throws(() => prepareJSONPayload({ title: 'Invalid', json }), /JSON payload/);
  }
  assert.throws(() => prepareJSONPayload({ title: 'Depth', json: '['.repeat(34) + '0' + ']'.repeat(34) }), /nesting/);
  assert.throws(() => prepareJSONPayload({ title: 'Nodes', json: '[' + Array(1025).fill('0').join(',') + ']' }), /1024/);
  const data = prepareJSONPayload({ title: 'Prepared', json: '{"id":9007199254740993}' });
  data.nodes[1].offset = -1;
  assert.throws(() => validatePreparedJSONPayload(data), /node offsets/);
});

test('removed components and legacy walkthrough namespace have no package exports', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.doesNotMatch(Object.keys(manifest.exports).join('\n'), /annotated-example|data-inspector|marble|state-transition/);
  assert.ok(manifest.exports['./code-walkthrough']);
  assert.ok(manifest.exports['./code-walkthrough/data']);
});
