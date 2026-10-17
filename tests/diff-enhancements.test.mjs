import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { compile, run } from '@mdx-js/mdx';
import { prepareCodeDiff, remarkCodeDiff } from '@vanhiep99w/docs-kit/code-diff';
import { diffCodeLines, splitDiffRows, validateCodeDiffInput, validatePreparedCodeDiff } from '@vanhiep99w/docs-kit/code-diff/data';
import { CodeDiff } from '@vanhiep99w/docs-kit/components/code-diff';

const plain = { highlight: false };
const make = (before, after, extra = {}) => ({ title: 'Detail', wordDiff: true, before: { code: before }, after: { code: after }, ...extra });
const changed = (data, side) => data.rows.filter((row) => row.type === (side === 'before' ? 'remove' : 'add')).flatMap((row) => {
  const text = diffCodeLines(data[side].code)[(side === 'before' ? row.beforeLine : row.afterLine) - 1].text;
  return (row.ranges ?? []).map(([start, end]) => text.slice(start, end));
});

test('word detail preserves unchanged words, exact whitespace, EOL semantics and copy originals', async () => {
  const data = await prepareCodeDiff(make('const retry = 3; // hello 👋\r\n', 'const retry = 5; // hello 🌏\r\n'), plain);
  assert.deepEqual(changed(data, 'before'), ['3', '👋']); assert.deepEqual(changed(data, 'after'), ['5', '🌏']);
  assert.equal(data.before.code, 'const retry = 3; // hello 👋\r\n');
  const eol = await prepareCodeDiff(make('same\r\n', 'same\n'), plain);
  assert.deepEqual(eol.rows.map((row) => row.ranges), [[], []]);
  const whitespace = await prepareCodeDiff(make('a b\n', 'a  b\n'), plain);
  assert.equal(changed(whitespace, 'before').join(''), ' '); assert.equal(changed(whitespace, 'after').join(''), '  ');
  const additions = await prepareCodeDiff(make('', 'added\n'), plain);
  assert.equal(additions.rows[0].ranges, undefined);
});

test('word ranges respect Unicode grapheme boundaries, including emoji ZWJ, combining marks and flags', async () => {
  const cases = [['cafe\u0301 👩‍👧‍👦 🇻🇳', 'café 👨‍👧‍👦 🇯🇵'], ['नमस्ते 你好 안녕', 'नमस्कार 你好 안녕하세요'], ['👍🏽 before', '👍🏻 after']];
  const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });
  for (const [before, after] of cases) {
    const data = await prepareCodeDiff(make(before, after), plain);
    for (const row of data.rows) {
      if (row.type === 'equal') continue;
      const code = row.type === 'remove' ? before : after;
      const boundaries = new Set([0, code.length, ...Array.from(segmenter.segment(code), (part) => part.index)]);
      for (const range of row.ranges ?? []) for (const boundary of range) assert.ok(boundaries.has(boundary), `${code}: ${boundary}`);
    }
    validatePreparedCodeDiff(data);
  }
});

test('bounded word LCS falls back to whole paired lines and never serializes matrices or segmentation', async () => {
  const before = 'a '.repeat(600); const after = 'b '.repeat(600);
  const data = await prepareCodeDiff(make(before, after), plain);
  assert.deepEqual(data.rows[0].ranges, [[0, before.length]]); assert.deepEqual(data.rows[1].ranges, [[0, after.length]]);
  assert.doesNotMatch(JSON.stringify(data), /matrix|cells|segmenter/);
  const paired = await prepareCodeDiff(make('first old\nsecond old\n', 'first new\n'), plain);
  assert.ok(paired.rows.find((row) => row.type === 'remove' && row.beforeLine === 1).ranges);
  assert.equal(paired.rows.find((row) => row.type === 'remove' && row.beforeLine === 2).ranges, undefined);
});

test('split projection covers both sides once, pairs replacements and leaves unmatched cells empty', async () => {
  for (const [before, after] of [['', ''], ['', 'one\n'], ['one\n', ''], ['old\nold2\nend\n', 'new\nend\n'], ['a\r\nb', 'a\nb\n']]) {
    const data = await prepareCodeDiff(make(before, after, { view: 'split', contextLines: 0 }), plain);
    const pairs = splitDiffRows(data);
    for (const side of ['before', 'after']) {
      const indices = pairs.flatMap((pair) => pair[side] === undefined ? [] : [pair[side]]);
      assert.deepEqual(indices, data.rows.flatMap((row, index) => side === 'before' ? row.type === 'add' ? [] : [index] : row.type === 'remove' ? [] : [index]));
    }
    const html = renderToStaticMarkup(createElement(CodeDiff, { data }));
    assert.match(html, /data-view="split"/);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]); assert.equal(ids.length, new Set(ids).size);
    assert.equal([...html.matchAll(/data-before-line="/g)].length, diffCodeLines(before).length);
    assert.equal([...html.matchAll(/data-after-line="/g)].length, diffCodeLines(after).length);
  }
});

test('new fields and prepared word ranges validate bounds, ordering, row kind and surrogate pairs', async () => {
  for (const value of [make('x', 'y', { view: 'sideways' }), make('x', 'y', { wordDiff: 'yes' })]) assert.throws(() => validateCodeDiffInput(value), /Code Diff/);
  const data = await prepareCodeDiff(make('👋 old', '🌏 new'), plain);
  for (const ranges of [[[0, 1]], [[1, 2]], [[-1, 2]], [[0, 999]], [[2, 3], [0, 2]], [[0, 2], [1, 3]], [[0, 0]], new Array(1)]) {
    const bad = structuredClone(data); bad.rows[0].ranges = ranges;
    assert.throws(() => validatePreparedCodeDiff(bad), /Code Diff/);
  }
  assert.throws(() => validatePreparedCodeDiff({ ...data, wordDiff: false }), /word ranges/);
  const equal = await prepareCodeDiff(make('same', 'same'), plain); equal.rows[0].ranges = [[0, 2]];
  assert.throws(() => validatePreparedCodeDiff(equal), /unknown property/);
});

test('word highlights cross syntax token boundaries without losing colors, text or escaping', async () => {
  const data = await prepareCodeDiff(make('alphaBeta', 'alphaGamma', {
    before: { code: 'alphaBeta', tokens: [[{ content: 'alpha', light: '#123456' }, { content: 'Beta', light: '#654321' }]] },
    after: { code: 'alphaGamma', tokens: [[{ content: 'alpha', dark: '#123456' }, { content: 'Gamma', dark: '#654321' }]] },
  }), plain);
  const html = renderToStaticMarkup(createElement(CodeDiff, { data }));
  assert.equal([...html.matchAll(/data-word-changed="true"/g)].length, 4);
  assert.match(html, /--code-diff-token-light:#123456/); assert.match(html, /--code-diff-token-dark:#654321/);
});
