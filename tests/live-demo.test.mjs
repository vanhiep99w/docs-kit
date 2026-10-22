import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveDemo } from '@vanhiep99w/docs-kit/components/live-demo';

const render = props => renderToStaticMarkup(createElement(LiveDemo, { src:'https://demos.test/demo/v1/', title:'React + Vue', ...props }));
test('SSR does not load an iframe; links and explanation survive without JS', () => {
  const html = render({sourceUrl:'https://github.com/example/demo',title:'<script>alert(1)</script>'});
  assert.doesNotMatch(html, /<iframe/);
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /Chạy thử/);
  assert.match(html, /Mở tab mới/);
  assert.match(html, /Source code/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /&lt;script&gt;/);
});
test('validates URL protocols and dimensions before rendering', () => {
  for (const src of ['javascript:alert(1)','data:text/html,test','//evil.test','/\\evil.test','https://user:secret@demo.test',' https://demo.test','https://demo.test\n']) {
    assert.throws(() => render({src}), /LiveDemo src/);
  }
  assert.throws(() => render({sourceUrl:'javascript:alert(1)'}), /sourceUrl/);
  for (const height of [0, 199, 1601, NaN, Infinity]) assert.throws(() => render({height}), /height/);
  assert.throws(() => render({title:''}), /title/);
  assert.match(render({src:'/demos/v1/',height:440}), /440px/);
});
test('live-demo CSS is exported independently, scoped and theme-aware', async () => {
  const css = await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/live-demo.css')), 'utf8');
  assert.match(css, /\.live-demo iframe/);
  assert.match(css, /data-theme="dark"/);
  assert.doesNotMatch(css, /(?:^|\n)(?:body|iframe|button)\s*\{/);
});
