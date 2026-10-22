import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { ExampleExplorerProvider, ExampleRef } from '@vanhiep99w/docs-kit/components/example-explorer';
import { readExampleURL, writeExampleURL, validateExamples, resolveExample, validateExampleURL } from '@vanhiep99w/docs-kit/example-explorer';

const examples = [
  {id:'shop',title:'Shop',defaultVersion:'v1',versions:[
    {id:'v1',title:'Snapshot',src:'https://example.test/shop/v1/',sourceUrl:'https://github.com/example/shop'},
    {id:'events',title:'Event only',src:'https://example.test/shop/v1/?mode=events-only'},
  ]},
  {id:'bus',title:'Bus',defaultVersion:'v1',versions:[{id:'v1',title:'Vanilla',src:'/bus/v1/'}]},
];
test('validates multi-example/version registry and resolves an explicit default', () => {
  validateExamples(examples);
  validateExamples([]);
  assert.equal(resolveExample(examples,{example:'shop'}).version.id,'v1');
  assert.equal(resolveExample(examples,{example:'shop',version:'events'}).version.title,'Event only');
  assert.throws(()=>resolveExample(examples,{example:'missing'}), /Không tìm thấy/);
  assert.throws(()=>resolveExample(examples,{example:'shop',version:'missing'}), /không tồn tại/);
});
test('rejects malformed definitions, duplicate IDs, missing defaults and unsafe URLs', () => {
  const clone=()=>structuredClone(examples);
  for(const invalid of [null,{},[...examples,examples[0]],[{...examples[0],versions:[]}],[{...examples[0],defaultVersion:'missing'}],[{...examples[0],versions:[examples[0].versions[0],examples[0].versions[0]]}]]) {
    assert.throws(()=>validateExamples(invalid));
  }
  for(const src of ['javascript:alert(1)','data:text/html,test','//evil.test','/\\evil.test','https://u:p@evil.test',' https://demo.test','https://demo.test\n']) {
    assert.throws(()=>validateExampleURL(src));
    const entries=clone();entries[0].versions[0].src=src;
    assert.throws(()=>validateExamples(entries));
  }
});
test('URL helpers preserve source state, unrelated queries and hash, and never accept query-provided src', () => {
  const url=new URL('https://docs.test/page?q=one&source=demo&snapshot=v1#section');
  const written=writeExampleURL(url,{example:'shop',version:'events'});
  assert.deepEqual(readExampleURL(written),{example:'shop',version:'events'});
  assert.equal(written.searchParams.get('source'),'demo');
  assert.equal(written.searchParams.get('snapshot'),'v1');
  assert.equal(written.hash,'#section');
  assert.equal(writeExampleURL(written,null).href,url.href);
  assert.equal(readExampleURL(new URL('https://docs.test/?example=javascript:evil')),null);
  assert.deepEqual(readExampleURL(new URL('https://docs.test/?example=shop&src=https://evil.test')),{example:'shop',version:undefined});
  assert.throws(()=>writeExampleURL(url,{example:'bad/id'}));
});
test('SSR has small real fallback links, no inline frame/header/footer, and rejects authored mistakes', () => {
  const html=renderToStaticMarkup(createElement(ExampleExplorerProvider,{examples},
    createElement(ExampleRef,{example:'shop'},'Example shop'),
    createElement(ExampleRef,{example:'shop',version:'events'},'Event only'),
    createElement(ExampleRef,{example:'bus'},'Bus')));
  assert.match(html,/href="https:\/\/example.test\/shop\/v1\//);
  assert.match(html,/mode=events-only/);
  assert.match(html,/href="\/bus\/v1\/"/);
  assert.equal([...html.matchAll(/class="example-ref /g)].length,3);
  assert.doesNotMatch(html,/<iframe|<dialog|live-demo-toolbar|live-demo-footer/);
  assert.throws(()=>renderToStaticMarkup(createElement(ExampleExplorerProvider,{examples},
    createElement(ExampleRef,{example:'typo'}))), /Không tìm thấy/);
  assert.throws(()=>renderToStaticMarkup(createElement(ExampleRef,{example:'shop'})), /requires/);
  assert.match(renderToStaticMarkup(createElement(ExampleRef,{example:'shop',href:'https://demo.test'})),/https:\/\/demo.test/);
});
test('component entry is browser-only without bundling Node, parsers, Fumadocs or a source drawer', async () => {
  const result=await build({entryPoints:['src/components/example-explorer/index.ts'],bundle:true,write:false,platform:'browser',format:'esm',external:['react','react/jsx-runtime'],metafile:true,logLevel:'silent'});
  const inputs=Object.keys(result.metafile.inputs).join('\n');
  assert.doesNotMatch(inputs,/node_modules|source-explorer\/explorer|next\/|fumadocs|yaml|shiki|d2\/render/);
  const css=await readFile(new URL(import.meta.resolve('@vanhiep99w/docs-kit/styles/example-explorer.css')),'utf8');
  assert.match(css,/\.example-dialog::backdrop/);
  assert.doesNotMatch(css,/data-source-drawer-open|\.source-drawer|(?:^|\n)(?:body|html)\s*\{/);
});
