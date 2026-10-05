import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSource } from '../src/source.js';

const json = body => ({ ok: true, status: 200, json: async () => body });

test('function source pages until an empty result', async () => {
  const pages = [['a.jpg', 'b.jpg'], ['c.jpg'], []];
  const seen = [];
  const s = createSource({ source: async ({ page }) => { seen.push(page); return pages[page - 1]; } });
  assert.deepEqual(await s.next(), { items: ['a.jpg', 'b.jpg'], done: false, total: null });
  assert.deepEqual(await s.next(), { items: ['c.jpg'], done: false, total: null });
  assert.deepEqual(await s.next(), { items: [], done: true, total: null });
  assert.deepEqual(seen, [1, 2, 3]);
});

test('function source follows cursors and stops when next is null', async () => {
  const cursors = [];
  const s = createSource({ source: async ({ cursor }) => {
    cursors.push(cursor);
    return cursor ? { items: ['b.jpg'], nextPageToken: null } : { items: ['a.jpg'], nextPageToken: 'tok' };
  } });
  assert.equal((await s.next()).done, false);
  assert.equal((await s.next()).done, true);
  assert.deepEqual(cursors, [null, 'tok']);
});

test('json source with {page} fetches numbered pages', async () => {
  const urls = [];
  globalThis.fetch = async url => { urls.push(url); return json(urls.length < 3 ? [{ src: 'x.jpg' }] : []); };
  const s = createSource({ src: 'https://site.com/api?page={page}' });
  assert.equal((await s.next()).done, false);
  assert.equal((await s.next()).done, false);
  assert.equal((await s.next()).done, true);
  assert.deepEqual(urls, ['https://site.com/api?page=1', 'https://site.com/api?page=2', 'https://site.com/api?page=3']);
});

test('json source follows relative next URLs and cursor tokens', async () => {
  const urls = [];
  const bodies = [
    { items: ['a.jpg'], next: 'p2' },
    { items: ['b.jpg'], cursor: 'abc/123' },
    { items: ['c.jpg'], cursor: null },
  ];
  globalThis.fetch = async url => { urls.push(url); return json(bodies[urls.length - 1]); };
  const s = createSource({ src: 'https://site.com/api/p1' });
  assert.equal((await s.next()).done, false);
  assert.equal((await s.next()).done, false);
  assert.equal((await s.next()).done, true);
  assert.deepEqual(urls, ['https://site.com/api/p1', 'https://site.com/api/p2', 'https://site.com/api/p2?cursor=abc%2F123']);
});

test('json source without {page} or next loads once', async () => {
  globalThis.fetch = async () => json([{ src: 'a.jpg' }, { src: 'b.jpg' }]);
  const s = createSource({ src: 'https://site.com/album.json' });
  const r = await s.next();
  assert.equal(r.items.length, 2);
  assert.equal(r.done, true);
});

test('json source surfaces HTTP errors and refuses unsafe URLs', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(createSource({ src: 'https://site.com/a.json' }).next(), /503/);
  await assert.rejects(createSource({ src: 'javascript:alert(1)' }).next(), /refusing/);
});

test('json source refuses a next link that switches to another protocol', async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; return json({ items: ['a.jpg'], next: 'javascript:alert(1)' }); };
  const s = createSource({ src: 'https://site.com/a.json' });
  const r = await s.next();
  assert.equal(r.done, true, 'an unsafe next link ends paging instead of being followed');
  assert.equal(n, 1);
});

test('query values reach JSON URLs (empty ones skipped) and functions', async () => {
  const urls = [];
  globalThis.fetch = async url => { urls.push(url); return json({ items: ['a.jpg'], total: 41, next: null }); };
  const s = createSource({ src: 'https://site.com/api?page={page}', query: { sort: 'price', q: '', inStock: true, off: false, page: 9 } });
  const r = await s.next();
  assert.equal(r.total, 41);
  assert.equal(urls[0], 'https://site.com/api?page=1&sort=price&inStock=true');

  let ctx;
  const f = createSource({ source: async c => { ctx = c; return []; }, query: { sort: 'new', page: 99 } });
  await f.next();
  assert.equal(ctx.sort, 'new');
  assert.equal(ctx.page, 1, 'paging fields cannot be overridden by the query');
});

test('sources resume from saved state', async () => {
  const pages = [];
  const f = createSource({ source: async ({ page, cursor }) => { pages.push([page, cursor]); return { items: ['x'], cursor: 'c' + page }; } }, { page: 4, cursor: 'c3' });
  await f.next();
  assert.deepEqual(pages, [[4, 'c3']]);
  assert.deepEqual(f.state(), { page: 5, cursor: 'c4' });

  const urls = [];
  globalThis.fetch = async url => { urls.push(url); return json({ items: ['x'], next: '/api/after-x' }); };
  const j = createSource({ src: 'https://site.com/api?page={page}' }, { page: 3 });
  await j.next();
  assert.equal(urls[0], 'https://site.com/api?page=3');
  const st = j.state();
  assert.equal(st.nextUrl, 'https://site.com/api/after-x');
  const j2 = createSource({ src: 'https://site.com/api?page={page}' }, st);
  await j2.next();
  assert.equal(urls[1], 'https://site.com/api/after-x');
});

test('total is ignored when it is not a non-negative number', async () => {
  globalThis.fetch = async () => json({ items: ['a'], total: 'lots', next: null });
  assert.equal((await createSource({ src: 'https://s.com/a' }).next()).total, null);
});
