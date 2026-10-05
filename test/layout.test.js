import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, ratioOf } from '../src/layout.js';

const rand = seed => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const sample = (n, seed = 7) => {
  const r = rand(seed);
  const shapes = [[3, 2], [2, 3], [4, 5], [16, 9], [1, 1], [3, 1], [1, 3]];
  return Array.from({ length: n }, () => { const [w, h] = shapes[Math.floor(r() * shapes.length)]; return { w: w * 500, h: h * 500 }; });
};
const rows = boxes => {
  const m = new Map();
  boxes.forEach(b => { if (!m.has(b.y)) m.set(b.y, []); m.get(b.y).push(b); });
  return [...m.values()];
};

test('empty input and zero width give an empty layout', () => {
  assert.deepEqual(layout([], 800), { boxes: [], height: 0 });
  assert.deepEqual(layout(sample(5), 0), { boxes: [], height: 0 });
  assert.deepEqual(layout(sample(5), -10), { boxes: [], height: 0 });
});

test('missing or broken dimensions are treated as square', () => {
  assert.equal(ratioOf({}), 1);
  assert.equal(ratioOf({ w: 0, h: 10 }), 1);
  assert.equal(ratioOf({ w: NaN, h: 10 }), 1);
  assert.equal(ratioOf({ w: 100000, h: 1 }), 5);
  assert.equal(ratioOf({ w: 1, h: 100000 }), 0.25);
});

for (const W of [320, 375, 768, 1280, 1920]) {
  test(`justified rows fill exactly ${W}px with the configured gap`, () => {
    const items = sample(300);
    const { boxes, height } = layout(items, W, { gap: 6, rowHeight: 200 });
    assert.equal(boxes.length, items.length);
    const rs = rows(boxes);
    rs.slice(0, -1).forEach(row => {
      const right = Math.max(...row.map(b => b.x + b.w));
      assert.equal(right, W, 'full rows end at the container edge');
      row.sort((a, b) => a.x - b.x);
      for (let k = 1; k < row.length; k++) {
        const gap = row[k].x - (row[k - 1].x + row[k - 1].w);
        assert.ok(gap >= 5 && gap <= 7, `gap ${gap} should be about 6`);
      }
      assert.ok(row[0].h <= 300, 'rows never grow past 1.5x the target');
    });
    const last = rs[rs.length - 1];
    assert.ok(last[0].h <= 200, 'last row is not stretched');
    const bottom = Math.max(...boxes.map(b => b.y + b.h));
    assert.equal(height, bottom);
  });
}

test('justified keeps aspect ratios within rounding', () => {
  const items = sample(120);
  const { boxes } = layout(items, 1000, { gap: 4, rowHeight: 180 });
  boxes.forEach((b, i) => {
    const expected = ratioOf(items[i]) * b.h;
    assert.ok(Math.abs(b.w - expected) <= 2 + b.h * 0.02, `item ${i}: ${b.w} vs ${expected.toFixed(1)}`);
  });
});

for (const mode of ['justified', 'masonry', 'grid']) {
  test(`${mode}: appending never moves already placed items`, () => {
    const all = sample(200, 3);
    const opts = { mode, gap: 8, rowHeight: 200, columnWidth: 220 };
    const a = layout(all.slice(0, 120), 1100, opts).boxes;
    const b = layout(all, 1100, opts).boxes;
    const lastY = mode === 'justified' ? a[a.length - 1].y : Infinity;
    a.forEach((box, i) => { if (box.y < lastY) assert.deepEqual(b[i], box); });
  });

  test(`${mode}: tiles never overlap`, () => {
    const { boxes } = layout(sample(150, 11), 900, { mode, gap: 6, rowHeight: 200, columnWidth: 200 });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i], q = boxes[j];
        const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
        assert.ok(!overlap, `${i} overlaps ${j}`);
      }
    }
  });
}

test('masonry uses floor(width / column) columns and stays within width', () => {
  const { boxes } = layout(sample(40), 1000, { mode: 'masonry', gap: 10, columnWidth: 240 });
  const xs = new Set(boxes.map(b => b.x));
  assert.equal(xs.size, 4);
  boxes.forEach(b => assert.ok(b.x + b.w <= 1000));
});

test('a single very wide image still produces a valid row', () => {
  const { boxes, height } = layout([{ w: 9000, h: 1000 }], 400, { rowHeight: 200 });
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].w, 400);
  assert.ok(height > 0 && height <= 200);
});
