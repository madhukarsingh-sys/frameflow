import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl, safeFetchUrl, normalizeItem, parseSrcset, pickCandidate } from '../src/items.js';

test('safeUrl allows http(s), relative, blob and image data URLs', () => {
  for (const u of ['https://a.com/x.jpg', 'http://a.com/x.jpg', '/img/x.jpg', 'x.jpg', '../x.webp',
    'blob:https://a.com/1234', 'data:image/jpeg;base64,AAAA', 'data:image/svg+xml,%3Csvg%3E']) {
    assert.equal(safeUrl(u), u, u);
  }
});

test('safeUrl rejects script and other protocols', () => {
  for (const u of ['javascript:alert(1)', ' JAVASCRIPT:alert(1)', 'data:text/html,<script>', 'vbscript:x',
    'file:///etc/passwd', '', null, 42, {}, 'x'.repeat(9000)]) {
    assert.equal(safeUrl(u), null, String(u).slice(0, 30));
  }
});

test('safeFetchUrl only allows http(s) and resolves relative URLs', () => {
  assert.equal(safeFetchUrl('/api?page=1', 'https://site.com/a/'), 'https://site.com/api?page=1');
  assert.equal(safeFetchUrl('next.json', 'https://site.com/a/b.json'), 'https://site.com/a/next.json');
  assert.equal(safeFetchUrl('javascript:1'), null);
  assert.equal(safeFetchUrl('data:application/json,[]'), null);
});

test('parseSrcset handles strings and arrays, sorted by width, drops junk', () => {
  assert.deepEqual(parseSrcset('b.jpg 800w, a.jpg 400w, javascript:x 200w, bad'),
    [{ url: 'a.jpg', w: 400 }, { url: 'b.jpg', w: 800 }]);
  assert.deepEqual(parseSrcset([{ src: 'x.jpg', width: 640 }, { url: 'y.jpg', w: 320 }, null]),
    [{ url: 'y.jpg', w: 320 }, { url: 'x.jpg', w: 640 }]);
  assert.deepEqual(parseSrcset(undefined), []);
});

test('pickCandidate chooses the smallest image that is wide enough', () => {
  const c = parseSrcset('s.jpg 320w, m.jpg 640w, l.jpg 1280w');
  assert.equal(pickCandidate(c, 300), 's.jpg');
  assert.equal(pickCandidate(c, 641), 'l.jpg');
  assert.equal(pickCandidate(c, 5000), 'l.jpg');
  assert.equal(pickCandidate([], 100), null);
});

test('normalizeItem accepts strings and objects and cleans fields', () => {
  assert.equal(normalizeItem('a.jpg').src, 'a.jpg');
  const it = normalizeItem({ url: 'a.jpg', width: '1200', height: 800, alt: '  A   cat ', title: 'Cap', color: '#abc', id: 5 });
  assert.equal(it.src, 'a.jpg');
  assert.equal(it.w, 1200);
  assert.equal(it.h, 800);
  assert.equal(it.alt, 'A cat');
  assert.equal(it.caption, 'Cap');
  assert.equal(it.color, '#abc');
  assert.equal(it.id, '5');
});

test('normalizeItem rejects unsafe or empty items', () => {
  assert.equal(normalizeItem({ src: 'javascript:alert(1)' }), null);
  assert.equal(normalizeItem({}), null);
  assert.equal(normalizeItem(null), null);
  assert.equal(normalizeItem(7), null);
  assert.ok(normalizeItem({ id: 'x' }, true), 'allowed when a resolver builds URLs');
});

test('normalizeItem drops hostile color, lqip and dimension values', () => {
  const it = normalizeItem({ src: 'a.jpg', color: 'red;background:url(x)', lqip: 'data:image/png;base64,AA") , url("x', w: -5, h: Infinity });
  assert.equal(it.color, '');
  assert.equal(it.lqip, '');
  assert.equal(it.w, 0);
  assert.equal(it.h, 0);
});
