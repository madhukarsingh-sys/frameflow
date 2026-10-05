import { layout } from './layout.js';
import { normalizeItem, pickCandidate, safeUrl } from './items.js';
import { createSource } from './source.js';
import { injectStyles } from './styles.js';
import { Lightbox } from './lightbox.js';

export const VERSION = '1.0.0';

const DEFAULTS = {
  layout: 'justified',   // 'justified' | 'masonry' | 'grid'
  rowHeight: 220,        // justified: target row height in px
  columnWidth: 240,      // masonry / grid: minimum column width in px
  gap: 6,                // space between tiles in px
  height: null,          // e.g. '70vh' to scroll inside a frame; null scrolls with the page
  src: null,             // JSON URL, may contain {page}
  source: null,          // async ({page, cursor, signal}) => items | {items, next}
  items: null,           // initial items
  imageUrl: null,        // (item, widthPx, kind) => url | Promise<url>, for image CDNs
  lightbox: true,
  history: true,         // back button closes the viewer
  captions: true,
  measure: true,         // load images to find their size when w/h are missing
  preload: 1.5,          // start loading the next page this many screens early
  buffer: 1,             // keep tiles this many screens above/below the view
  credentials: 'same-origin',
  injectStyles: true,
  nonce: null,
  text: {},
};

const TEXT = {
  label: 'Photo gallery',
  viewer: 'Photo viewer',
  open: 'Open photo {n} of {total}',
  close: 'Close',
  prev: 'Previous photo',
  next: 'Next photo',
  loading: 'Loading photos',
  end: '',
  empty: 'No photos to show yet.',
  error: "Couldn't load more photos.",
  retry: 'Try again',
};

const WIDTH_STEPS = [160, 240, 320, 480, 640, 800, 1024, 1280, 1600, 1920, 2560, 3200, 3840];
const stepUp = w => WIDTH_STEPS.find(s => s >= w) || WIDTH_STEPS[WIDTH_STEPS.length - 1];
const thenable = v => v && typeof v.then === 'function';
const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : fn => setTimeout(fn, 16);

function readDataset(el) {
  const d = el.dataset, o = {};
  const n = k => (d[k] != null && d[k] !== '' && Number.isFinite(+d[k]) ? +d[k] : undefined);
  if (d.src) o.src = d.src;
  if (d.layout) o.layout = d.layout;
  if (d.height) o.height = d.height;
  if (n('rowHeight') != null) o.rowHeight = n('rowHeight');
  if (n('columnWidth') != null) o.columnWidth = n('columnWidth');
  if (n('gap') != null) o.gap = n('gap');
  for (const k of ['lightbox', 'history', 'captions', 'measure']) {
    if (d[k] != null) o[k] = d[k] !== 'false';
  }
  return o;
}

/** Collects <img> / <a><img></a> children so plain HTML works as a source. */
function harvest(el) {
  const out = [];
  el.querySelectorAll('img').forEach(img => {
    const a = img.closest('a');
    out.push({
      src: (a && a.getAttribute('href')) || img.getAttribute('data-full') || img.getAttribute('src'),
      thumb: img.getAttribute('src'),
      srcset: img.getAttribute('srcset') || undefined,
      w: img.getAttribute('data-w') || img.getAttribute('width'),
      h: img.getAttribute('data-h') || img.getAttribute('height'),
      alt: img.getAttribute('alt'),
      caption: (a && a.getAttribute('data-caption')) || img.getAttribute('data-caption') || img.getAttribute('title'),
    });
  });
  return out;
}

function measure(url, ms = 10000) {
  return new Promise(res => {
    if (!url) return res(null);
    const img = new Image();
    const t = setTimeout(() => res(null), ms);
    img.onload = () => { clearTimeout(t); res(img.naturalWidth ? [img.naturalWidth, img.naturalHeight] : null); };
    img.onerror = () => { clearTimeout(t); res(null); };
    img.src = url;
  });
}

export class Frameflow {
  /**
   * @param {Element|string} el  container element or selector
   * @param {object} [options]   see DEFAULTS above
   */
  constructor(el, options = {}) {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el || el.nodeType !== 1) throw new Error('Frameflow: container element not found');
    if (el.__frameflow) return el.__frameflow;
    el.__frameflow = this;

    const o = Object.assign({}, DEFAULTS, readDataset(el), options);
    o.text = Object.assign({}, TEXT, options.text);
    o.gap = Math.max(0, +o.gap || 0);
    this.o = o;
    this.el = el;
    this.items = [];
    this.boxes = [];
    this.order = [];
    this.maxH = 0;
    this.height = 0;
    this.width = 0;
    this.nodes = new Map();
    this.pool = [];
    this.done = false;
    this.loading = false;
    this.error = null;
    this.empties = 0;
    this._abort = typeof AbortController === 'function' ? new AbortController() : null;

    if (o.injectStyles) injectStyles(o.nonce);
    const initial = harvest(el);
    this._build();
    this.source = createSource(o);
    if (!this.source) this.done = true;
    this.lightbox = o.lightbox ? new Lightbox(this) : null;
    this._bind();

    const first = [...initial, ...(Array.isArray(o.items) ? o.items : [])];
    this._status();
    if (first.length) this.append(first);
    else this._schedule();
  }

  // ---- public API --------------------------------------------------------

  /** Adds items to the end. Accepts URL strings or item objects. */
  async append(list) {
    const allow = typeof this.o.imageUrl === 'function';
    const items = (Array.isArray(list) ? list : [list]).map(r => normalizeItem(r, allow)).filter(Boolean);
    if (this.o.measure) {
      await Promise.all(items.map(async it => {
        if (it.w > 0 && it.h > 0) return;
        const d = await measure(this._sync(this._thumbFor(it, 320)) || it.thumb || it.src);
        if (d) { it.w = d[0]; it.h = d[1]; }
      }));
    }
    if (this.destroyed || !items.length) { this._status(); return items.length; }
    const start = this.items.length;
    this.items.push(...items);
    this._layout();
    this._render();
    this._status();
    if (this.lightbox) this.lightbox.refresh();
    this._emit('load', { start, count: items.length, total: this.items.length });
    return items.length;
  }

  /** Loads the next page from the source, if there is one. */
  async loadMore() {
    if (this.loading || this.done || this.error || !this.source || this.destroyed) return;
    this.loading = true;
    this._status();
    try {
      const r = await this.source.next(this._abort && this._abort.signal);
      if (this.destroyed) return;
      const added = r.items.length ? await this.append(r.items) : 0;
      this.empties = added ? 0 : this.empties + 1;
      if (r.done || this.empties >= 3) {
        this.done = true;
        this._emit('end', { total: this.items.length });
      }
    } catch (err) {
      if (this.destroyed || (err && err.name === 'AbortError')) return;
      this.error = err;
      this._emit('error', { error: err });
      if (typeof console !== 'undefined') console.warn(err);
    } finally {
      this.loading = false;
      if (!this.destroyed) {
        this._status();
        if (this.lightbox) this.lightbox.refresh();
        if (!this.error) this._schedule();
      }
    }
  }

  /** Clears an error and tries the failed page again. */
  retry() { this.error = null; this._status(); this.loadMore(); }

  open(index) { if (this.lightbox) this.lightbox.open(index); }
  close() { if (this.lightbox) this.lightbox.close(); }

  /** Re-measures and re-lays out, e.g. after changing options. */
  refresh() { this._layout(true); this._render(); }

  /** Changes layout options at runtime: { layout, rowHeight, columnWidth, gap }. */
  set(opts) {
    for (const k of ['layout', 'rowHeight', 'columnWidth', 'gap']) if (k in opts) this.o[k] = opts[k];
    this.o.gap = Math.max(0, +this.o.gap || 0);
    this._layout(true);
    this._render();
  }

  /** Scrolls so photo `index` is visible, renders it and returns its tile. */
  reveal(index) {
    const b = this.boxes[index];
    if (!b) return null;
    const v = this._view();
    if (b.y < v.top || b.y + b.h > v.bottom) {
      const target = b.y - Math.max(0, (v.bottom - v.top - b.h) / 2);
      if (this.frame) this.el.scrollTop += target - v.top;
      else window.scrollBy(0, target - v.top);
    }
    this._render();
    return this.nodes.get(index) || null;
  }

  destroy() {
    this.destroyed = true;
    if (this._abort) this._abort.abort();
    if (this.lightbox) this.lightbox.destroy();
    this._ro && this._ro.disconnect();
    this._unbind && this._unbind();
    this.el.replaceChildren();
    this.el.classList.remove('ff', 'ff--frame');
    if (this.frame) this.el.style.height = '';
    delete this.el.__frameflow;
  }

  // ---- image URLs --------------------------------------------------------

  _sync(v) { return thenable(v) ? null : v; }

  _thumbFor(item, cssWidth) {
    const dpr = Math.min((typeof devicePixelRatio === 'number' && devicePixelRatio) || 1, 3);
    const need = stepUp(Math.ceil(cssWidth * dpr));
    if (this.o.imageUrl) {
      const r = this.o.imageUrl(item.data, need, 'thumb');
      return thenable(r) ? r.then(safeUrl) : safeUrl(r);
    }
    return pickCandidate(item.srcset, need) || item.thumb || item.src;
  }

  _fullFor(item, px) {
    const need = stepUp(Math.min(px, item.w || Infinity));
    if (this.o.imageUrl) {
      const r = this.o.imageUrl(item.data, need, 'full');
      return thenable(r) ? r.then(safeUrl) : safeUrl(r);
    }
    if (item.src && item.src !== item.thumb) return item.src;
    return pickCandidate(item.srcset, need) || item.src;
  }

  // ---- DOM ---------------------------------------------------------------

  _build() {
    const el = this.el, o = this.o;
    el.replaceChildren();
    el.classList.add('ff');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'region');
    if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', o.text.label);
    this.frame = !!o.height;
    if (this.frame) {
      el.classList.add('ff--frame');
      el.style.height = typeof o.height === 'number' ? o.height + 'px' : String(o.height);
      if (!el.hasAttribute('tabindex')) el.tabIndex = -1;
    }
    this.canvas = document.createElement('div');
    this.canvas.className = 'ff__canvas';
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'ff__status';
    this.statusEl.setAttribute('role', 'status');
    el.append(this.canvas, this.statusEl);
  }

  _tile() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ff__tile';
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.onload = () => { img.classList.add('is-loaded'); b.classList.remove('is-error'); };
    img.onerror = () => { if (img.getAttribute('src')) b.classList.add('is-error'); };
    b.appendChild(img);
    return b;
  }

  _mount(i) {
    const node = this.pool.pop() || this._tile();
    const item = this.items[i];
    const img = node.firstChild;
    node.dataset.i = String(i);
    this._position(node, this.boxes[i]);
    node.style.backgroundColor = item.color || '';
    node.style.backgroundImage = item.lqip ? `url("${item.lqip}")` : '';
    node.classList.remove('is-error');
    node.setAttribute('aria-label', (item.alt ? item.alt + '. ' : '') +
      this.o.text.open.replace('{n}', i + 1).replace('{total}', this.items.length + (this.done ? '' : '+')));
    img.classList.remove('is-loaded');
    img.removeAttribute('src');
    const tok = (node._tok = (node._tok || 0) + 1);
    const url = this._thumbFor(item, this.boxes[i].w);
    const set = u => { if (node._tok === tok && u) { img.src = u; if (img.complete && img.naturalWidth) img.classList.add('is-loaded'); } };
    if (thenable(url)) url.then(set, () => node.classList.add('is-error'));
    else set(url);
    if (!node.isConnected) this.canvas.appendChild(node);
    this.nodes.set(i, node);
  }

  _release(i, node) {
    this.nodes.delete(i);
    node._tok = (node._tok || 0) + 1;
    node.remove();
    if (this.pool.length < 120) this.pool.push(node);
  }

  _position(node, b) {
    const s = node.style;
    s.transform = `translate(${b.x}px,${b.y}px)`;
    s.width = b.w + 'px';
    s.height = b.h + 'px';
  }

  _status() {
    const s = this.statusEl, t = this.o.text;
    if (!s) return;
    s.replaceChildren();
    if (this.error) {
      const msg = document.createElement('span');
      msg.textContent = t.error;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ff__retry';
      btn.textContent = t.retry;
      btn.addEventListener('click', () => this.retry());
      s.append(msg, btn);
    } else if (this.loading) {
      const sp = document.createElement('span');
      sp.className = 'ff__spin';
      sp.setAttribute('aria-hidden', 'true');
      const msg = document.createElement('span');
      msg.textContent = t.loading;
      s.append(sp, msg);
    } else if (this.done) {
      s.textContent = this.items.length ? t.end : t.empty;
    }
  }

  // ---- layout & virtualization ------------------------------------------

  _layout(keepAnchor) {
    const w = this.canvas.clientWidth;
    let anchor = null;
    if (keepAnchor && this.boxes.length) {
      const v = this._view();
      const idx = this._firstVisible(v.top);
      if (idx != null) anchor = { idx, off: this.boxes[idx].y - v.top };
    }
    this.width = w;
    const o = this.o;
    const rowHeight = Math.max(80, Math.min(o.rowHeight, w * 0.55));
    const columnWidth = w < 600 ? Math.min(o.columnWidth, Math.max(110, (w - o.gap) / 2)) : o.columnWidth;
    const r = layout(this.items, w, { mode: o.layout, gap: o.gap, rowHeight, columnWidth });
    this.boxes = r.boxes;
    this.height = r.height;
    this.canvas.style.height = r.height + 'px';
    const order = this.boxes.map((_, i) => i);
    if (o.layout === 'masonry') order.sort((a, b) => this.boxes[a].y - this.boxes[b].y);
    this.order = order;
    this.maxH = this.boxes.reduce((m, b) => Math.max(m, b.h), 0);
    for (const [i, node] of this.nodes) this._position(node, this.boxes[i]);

    if (anchor) {
      const v = this._view();
      const delta = this.boxes[anchor.idx].y - anchor.off - v.top;
      if (Math.abs(delta) > 1) {
        if (this.frame) this.el.scrollTop += delta;
        else window.scrollBy(0, delta);
      }
    }
  }

  /** Visible area in canvas coordinates. */
  _view() {
    const r = this.canvas.getBoundingClientRect();
    let top = 0, bottom = window.innerHeight;
    if (this.frame) {
      const f = this.el.getBoundingClientRect();
      top = Math.max(top, f.top);
      bottom = Math.min(bottom, f.bottom);
    }
    return { top: top - r.top, bottom: bottom - r.top, h: Math.max(0, bottom - top) };
  }

  _lowerBound(y) {
    const { order, boxes } = this;
    let lo = 0, hi = order.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (boxes[order[mid]].y < y) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  _firstVisible(top) {
    for (let a = this._lowerBound(top - this.maxH); a < this.order.length; a++) {
      const i = this.order[a], b = this.boxes[i];
      if (b.y + b.h > top) return i;
    }
    return null;
  }

  _schedule() {
    if (this._pending || this.destroyed) return;
    this._pending = true;
    raf(() => { this._pending = false; if (!this.destroyed) this._render(); });
  }

  _render() {
    const v = this._view();
    const screen = Math.max(v.h, 300);
    const want = new Set();
    if (v.bottom > v.top) {
      const lo = v.top - screen * this.o.buffer;
      const hi = v.bottom + screen * this.o.buffer;
      for (let a = this._lowerBound(lo - this.maxH); a < this.order.length; a++) {
        const i = this.order[a], b = this.boxes[i];
        if (b.y > hi) break;
        if (b.y + b.h >= lo) want.add(i);
      }
    }
    const active = document.activeElement;
    for (const [i, node] of this.nodes) {
      if (!want.has(i) && node !== active) this._release(i, node);
    }
    for (const i of want) if (!this.nodes.has(i)) this._mount(i);

    const nearEnd = v.bottom > v.top && v.bottom > this.height - screen * this.o.preload;
    if (!this.done && !this.loading && !this.error && (nearEnd || !this.items.length)) this.loadMore();
  }

  // ---- events ------------------------------------------------------------

  _bind() {
    const onScroll = () => this._schedule();
    const scroller = this.frame ? this.el : window;
    scroller.addEventListener('scroll', onScroll, { passive: true });
    if (this.frame) window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    if (typeof ResizeObserver === 'function') {
      this._ro = new ResizeObserver(() => {
        const w = this.canvas.clientWidth;
        if (w && w !== this.width) { this._layout(true); this._render(); }
      });
      this._ro.observe(this.canvas);
    }

    const onClick = e => {
      const tile = e.target.closest && e.target.closest('.ff__tile');
      if (!tile || !this.el.contains(tile)) return;
      const i = +tile.dataset.i;
      this._emit('click', { index: i, item: this.items[i] && this.items[i].data });
      if (this.lightbox) this.lightbox.open(i);
    };
    const onKey = e => this._key(e);
    this.el.addEventListener('click', onClick);
    this.el.addEventListener('keydown', onKey);

    this._unbind = () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      this.el.removeEventListener('click', onClick);
      this.el.removeEventListener('keydown', onKey);
    };
  }

  /** Arrow keys move focus between tiles, rendering them as needed. */
  _key(e) {
    const tile = e.target.closest && e.target.closest('.ff__tile');
    if (!tile) return;
    const i = +tile.dataset.i, b = this.boxes[i], n = this.items.length;
    let t = null;
    if (e.key === 'ArrowRight') t = Math.min(n - 1, i + 1);
    else if (e.key === 'ArrowLeft') t = Math.max(0, i - 1);
    else if (e.key === 'Home') t = 0;
    else if (e.key === 'End') t = n - 1;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const down = e.key === 'ArrowDown', cx = b.x + b.w / 2;
      let best = null, bestScore = Infinity;
      for (let k = Math.max(0, i - 200); k < Math.min(n, i + 200); k++) {
        const c = this.boxes[k];
        const dy = down ? c.y - (b.y + b.h) : b.y - (c.y + c.h);
        if (dy < -1) continue;
        const score = dy * 4 + Math.abs(c.x + c.w / 2 - cx);
        if (score < bestScore) { bestScore = score; best = k; }
      }
      t = best;
    } else return;
    e.preventDefault();
    if (t == null || t === i) return;
    const node = this.reveal(t);
    if (node) node.focus({ preventScroll: true });
  }

  _emit(name, detail) {
    this.el.dispatchEvent(new CustomEvent('frameflow:' + name, { detail }));
  }
}

/** Creates galleries for every [data-frameflow] element not yet set up. */
export function autoInit(root = document) {
  return [...root.querySelectorAll('[data-frameflow]')]
    .filter(el => !el.__frameflow)
    .map(el => new Frameflow(el));
}

Frameflow.autoInit = autoInit;
Frameflow.version = VERSION;
export default Frameflow;
