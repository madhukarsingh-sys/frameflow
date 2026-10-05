// End-to-end tests in a real browser.
// Setup once:  npm i -D playwright && npx playwright install chromium
// Run:         npm run build && npm run test:e2e
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (path.includes('..')) { res.writeHead(400).end(); return; }
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
let failures = 0;
async function run(name, fn, ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...ctxOpts });
  // Web fonts are optional; serve them empty so tests run offline.
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await fn(page);
    assert.deepEqual(errors, [], 'no page errors');
    console.log(`ok   ${name}`);
  } catch (e) {
    failures++;
    console.log(`FAIL ${name}\n     ${e.message.split('\n').join('\n     ')}`);
  } finally {
    await ctx.close();
  }
}

const count = page => page.evaluate(() => document.querySelector('#gallery').__frameflow.items.length);
const domTiles = page => page.locator('#gallery .ff__tile').count();
const overlaps = page => page.evaluate(() => {
  const r = [...document.querySelectorAll('#gallery .ff__tile')].map(t => t.getBoundingClientRect());
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) {
    const a = r[i], b = r[j];
    if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) return [i, j];
  }
  return null;
});
async function scrollFrameToEnd(page, rounds = 60) {
  for (let k = 0; k < rounds; k++) {
    await page.evaluate(() => { const g = document.querySelector('#gallery'); g.scrollTop = g.scrollHeight; });
    await page.waitForTimeout(250);
    if (await page.evaluate(() => document.querySelector('#gallery').__frameflow.done)) break;
  }
}

await run('loads the first page and paints images', async page => {
  await page.goto(`${base}/demo/index.html`);
  await page.waitForFunction(() => document.querySelectorAll('#gallery .ff__tile img.is-loaded').length > 5);
  assert.ok(await count(page) >= 30);
  assert.equal(await overlaps(page), null);
});

await run('keeps loading in the frame until the album ends, with a bounded DOM', async page => {
  await page.goto(`${base}/demo/index.html`);
  await page.waitForFunction(() => document.querySelectorAll('#gallery .ff__tile').length > 0);
  let maxDom = 0;
  for (let k = 0; k < 80; k++) {
    await page.evaluate(() => { const g = document.querySelector('#gallery'); g.scrollTop += g.clientHeight * 1.5; });
    await page.waitForTimeout(120);
    maxDom = Math.max(maxDom, await domTiles(page));
    if (await page.evaluate(() => document.querySelector('#gallery').__frameflow.done)) break;
  }
  await scrollFrameToEnd(page);
  assert.equal(await count(page), 480, 'all 480 photos loaded');
  assert.ok(maxDom < 140, `DOM tiles stayed small (max ${maxDom})`);
  await page.waitForFunction(() => document.querySelector('#gallery .ff__status').textContent.includes('whole album'));
  assert.equal(await overlaps(page), null);
});

await run('viewer opens, navigates with keys, closes with Esc and restores focus', async page => {
  await page.goto(`${base}/demo/index.html`);
  await page.waitForFunction(() => document.querySelectorAll('#gallery .ff__tile img.is-loaded').length > 3);
  await page.locator('#gallery .ff__tile').nth(2).click();
  const dlg = page.locator('dialog.ff-lb');
  await dlg.waitFor({ state: 'visible' });
  await page.waitForTimeout(400);
  assert.match(await page.locator('.ff-lb__count').textContent(), /^3 \/ \d+/);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(450);
  assert.match(await page.locator('.ff-lb__count').textContent(), /^4 \/ /);
  assert.ok((await page.locator('.ff-lb__cap').textContent()).length > 5, 'caption shown');
  await page.waitForFunction(() => document.querySelector('.ff-lb__img.is-current').getAttribute('src'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.ff-lb').open);
  const focused = await page.evaluate(() => document.activeElement.dataset.i);
  assert.equal(focused, '3', 'focus returns to the photo that was being viewed');
});

await run('back button closes the viewer without leaving the page', async page => {
  await page.goto(`${base}/demo/index.html`);
  await page.waitForFunction(() => document.querySelectorAll('#gallery .ff__tile').length > 3);
  await page.locator('#gallery .ff__tile').first().click();
  await page.locator('dialog.ff-lb').waitFor({ state: 'visible' });
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('dialog.ff-lb').open);
  assert.ok(page.url().endsWith('/demo/index.html'));
});

await run('dragging the photo sideways moves to the next one', async page => {
  await page.goto(`${base}/demo/index.html`);
  await page.waitForFunction(() => document.querySelectorAll('#gallery .ff__tile').length > 3);
  await page.locator('#gallery .ff__tile').first().click();
  await page.locator('dialog.ff-lb').waitFor({ state: 'visible' });
  await page.waitForTimeout(400);
  await page.mouse.move(900, 430);
  await page.mouse.down();
  for (let x = 900; x >= 400; x -= 50) await page.mouse.move(x, 432);
  await page.mouse.up();
  await page.waitForTimeout(500);
  assert.match(await page.locator('.ff-lb__count').textContent(), /^2 \/ /);
});

await run('double click zooms in and out', async page => {
  await page.goto(`${base}/demo/index.html`);
  await page.waitForFunction(() => document.querySelectorAll('#gallery .ff__tile').length > 3);
  await page.locator('#gallery .ff__tile').first().click();
  await page.locator('dialog.ff-lb').waitFor({ state: 'visible' });
  await page.waitForTimeout(400);
  await page.mouse.click(640, 430);
  await page.mouse.click(640, 430);
  await page.waitForTimeout(350);
  assert.ok(await page.locator('dialog.ff-lb.is-zoomed').count() === 1, 'zoomed in');
  await page.mouse.click(640, 430);
  await page.mouse.click(640, 430);
  await page.waitForTimeout(350);
  assert.ok(await page.locator('dialog.ff-lb.is-zoomed').count() === 0, 'zoomed out');
});

await run('switching layouts re-flows without overlaps', async page => {
  await page.goto(`${base}/demo/index.html`);
  await page.waitForFunction(() => document.querySelectorAll('#gallery .ff__tile').length > 3);
  for (const l of ['masonry', 'grid', 'justified']) {
    await page.click(`[data-layout="${l}"]`);
    await page.waitForTimeout(150);
    assert.equal(await overlaps(page), null, l);
  }
});

await run('page-scrolling mode loads as the window scrolls', async page => {
  await page.goto(`${base}/demo/index.html`);
  await page.waitForFunction(() => document.querySelectorAll('#gallery .ff__tile').length > 3);
  await page.click('[data-mode="page"]');
  await page.waitForFunction(() => document.querySelector('#gallery').__frameflow.items.length >= 30);
  const before = await count(page);
  for (let k = 0; k < 10; k++) { await page.mouse.wheel(0, 1600); await page.waitForTimeout(200); }
  await page.waitForTimeout(800);
  assert.ok(await count(page) > before, 'more photos loaded');
});

await run('arrow keys move focus through tiles beyond the rendered range', async page => {
  await page.goto(`${base}/demo/index.html`);
  await page.waitForFunction(() => document.querySelectorAll('#gallery .ff__tile').length > 3);
  await page.locator('#gallery .ff__tile').first().focus();
  for (let k = 0; k < 25; k++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80); }
  const i = await page.evaluate(() => +document.activeElement.dataset.i);
  assert.ok(i > 40, `focus moved down to photo ${i}`);
});

await run('mobile: tiles fit the narrow screen and the viewer opens', async page => {
  await page.goto(`${base}/demo/index.html`);
  await page.waitForFunction(() => document.querySelectorAll('#gallery .ff__tile').length > 3);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false, 'no sideways scrolling');
  await page.locator('#gallery .ff__tile').first().tap();
  await page.locator('dialog.ff-lb').waitFor({ state: 'visible' });
}, { viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

await run('JSON example follows relative next links to the end', async page => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"><rect width="4" height="3" fill="#789"/></svg>';
  await page.route(/picsum\.photos/, r => r.fulfill({ contentType: 'image/svg+xml', body: svg }));
  await page.goto(`${base}/examples/json/index.html`);
  for (let k = 0; k < 40; k++) {
    await page.evaluate(() => { const g = document.querySelector('[data-frameflow]'); g.scrollTop = g.scrollHeight; });
    await page.waitForTimeout(120);
    if (await page.evaluate(() => document.querySelector('[data-frameflow]').__frameflow.done)) break;
  }
  const r = await page.evaluate(() => { const f = document.querySelector('[data-frameflow]').__frameflow; return [f.items.length, f.done]; });
  assert.deepEqual(r, [72, true]);
});

// A bare page to test the API directly.
const fixture = `<!doctype html><meta charset=utf-8><body style="margin:0">
<div id="g"></div><script src="/dist/frameflow.min.js" data-manual></script>`;
async function bare(page) {
  await page.route(`${base}/bare.html`, r => r.fulfill({ contentType: 'text/html', body: fixture }));
  await page.goto(`${base}/bare.html`);
}
const pixel = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22200%22%3E%3Crect width=%22300%22 height=%22200%22 fill=%22teal%22/%3E%3C/svg%3E';

await run('shows an error with a working retry button', async page => {
  await bare(page);
  await page.evaluate(() => { window.__fails = 1; });
  await page.evaluate(px => {
    window.g = new Frameflow('#g', { height: 400, source: async ({ page }) => {
      if (window.__fails-- > 0) throw new Error('offline');
      return page > 1 ? [] : [{ src: px, w: 300, h: 200 }, { src: px, w: 300, h: 200 }];
    } });
  }, pixel);
  await page.getByRole('button', { name: 'Try again' }).waitFor();
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.waitForFunction(() => window.g.items.length === 2 && window.g.done);
});

await run('treats item text as text and drops unsafe URLs', async page => {
  await bare(page);
  await page.evaluate(px => {
    window.hit = false;
    window.g = new Frameflow('#g', { items: [
      { src: px, w: 3, h: 2, caption: '<img src=x onerror="window.hit=true">', alt: '"><b>x</b>' },
      { src: 'javascript:window.hit=true', w: 3, h: 2 },
    ] });
  }, pixel);
  await page.waitForFunction(() => window.g.items.length === 1);
  await page.locator('.ff__tile').first().click();
  await page.locator('dialog.ff-lb').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.ff-lb__cap').textContent(), '<img src=x onerror="window.hit=true">');
  assert.equal(await page.locator('.ff-lb__cap img').count(), 0);
  assert.equal(await page.evaluate(() => window.hit), false);
});

await run('progressive enhancement: existing <img> markup becomes the album', async page => {
  await page.route(`${base}/pe.html`, r => r.fulfill({ contentType: 'text/html', body:
    `<!doctype html><body><div data-frameflow data-height="300">
     <a href="${pixel}" data-caption="One"><img src="${pixel}" width="300" height="200" alt="First"></a>
     <img src="${pixel}" width="300" height="200" alt="Second"></div>
     <script src="/dist/frameflow.min.js"></script>` }));
  await page.goto(`${base}/pe.html`);
  await page.waitForFunction(() => document.querySelectorAll('.ff__tile').length === 2);
  assert.match(await page.locator('.ff__tile').first().getAttribute('aria-label'), /^First\. Open photo 1 of 2/);
});

await run('destroy() removes the gallery and its viewer', async page => {
  await bare(page);
  await page.evaluate(px => { window.g = new Frameflow('#g', { items: [px, px, px] }); }, pixel);
  await page.waitForFunction(() => document.querySelectorAll('.ff__tile').length === 3);
  await page.locator('.ff__tile').first().click();
  await page.evaluate(() => window.g.destroy());
  assert.equal(await page.locator('.ff__tile').count(), 0);
  assert.equal(await page.locator('dialog.ff-lb').count(), 0);
});

await browser.close();
server.close();
console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
