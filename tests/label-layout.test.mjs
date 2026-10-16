import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { D2 } from '@d2lang/d2';
import { compileWithFittedLabels } from '../dist/d2/render.mjs';

function render(source, options = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [fileURLToPath(new URL('../dist/d2/render.mjs', import.meta.url))], {
      timeout: 60_000,
      maxBuffer: 20 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || error.message));
      try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
    });
    child.stdin.on('error', reject);
    child.stdin.end(JSON.stringify({ source, salt: 'label-regression', options }));
  });
}

for (const layout of ['elk', 'dagre', 'tala']) {
  test(`fits actual sketch-font measurements with ${layout} instead of pushing labels outside fixed boxes`, async () => {
    // Reproduce all three reported examples, plus a tight diamond.
    const { labelLayout } = await render(String.raw`
direction: right
page: "Page component" {width: 136; height: 58}
child: "UI component con" {width: 152; height: 58}
consumer: "Ghi dependency\nStatusComponent dùng\nmessage" {width: 184; height: 79}
zone: "Zone.js báo Angular\nAsync work hoàn thành" {width: 192; height: 58}
guard: "Guard\ncho phép?" {shape: diamond; width: 100; height: 60}
page -> child -> consumer -> zone -> guard
  `, { layout });
    assert.equal(labelLayout.length, 5);
    for (const box of labelLayout) {
      assert.equal(box.labelPosition, 'INSIDE_MIDDLE_CENTER', box.id);
      assert.ok(box.width >= box.labelWidth + 24, `${box.id}: horizontal text padding`);
      assert.ok(box.height >= box.labelHeight + 16, `${box.id}: vertical text padding`);
      if (box.type === 'diamond') {
        assert.ok(box.labelWidth / (box.width - 24) + box.labelHeight / (box.height - 16) <= 1);
      }
    }
    assert.ok(labelLayout.find(({ id }) => id === 'page').width > 136);
    assert.ok(labelLayout.find(({ id }) => id === 'child').width > 152);
  });
}

test('TALA preserves pinned coordinates when fitting undersized labels', async () => {
  const d2 = new D2();
  try {
    const { diagram, labelLayout } = await compileWithFittedLabels(d2, `
api: "API component with a long label" {
  top: 100
  left: 200
  width: 80
  height: 40
}
db: Database { top: 100; left: 800 }
api -> db
`, { layout: 'tala' });
    const api = diagram.shapes.find(({ id }) => id === 'api');
    const db = diagram.shapes.find(({ id }) => id === 'db');
    assert.deepEqual(api.pos, { x: 200, y: 100 });
    assert.deepEqual(db.pos, { x: 800, y: 100 });
    assert.ok(api.width > 80);
    assert.equal(labelLayout.length, 2);
    assert.ok(labelLayout.every((box) => box.labelPosition === 'INSIDE_MIDDLE_CENTER'));
  } finally {
    await d2.dispose();
  }
});
