// Full-screen viewer. Built on <dialog> so focus trapping, Esc and the top
// layer come from the browser. Three slides (previous, current, next) are
// recycled as the viewer moves, so memory use does not grow with album size.

const MAX_ZOOM = 4;
const GAP = 24;
const ICONS = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
};
const icon = p => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const now = () => performance.now();
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const thenable = v => v && typeof v.then === 'function';
const resolve = (v, fn) => (thenable(v) ? v.then(fn, () => {}) : fn(v));

export class Lightbox {
  constructor(gallery) {
    this.g = gallery;
    this.i = -1;
    this.isOpen = false;
    this.z = 1; this.px = 0; this.py = 0;
    this.pointers = new Map();
    this.slides = [];
    this.seq = 0;
    this.wheelAcc = 0; this.wheelCool = 0; this.wheelLast = 0;
  }

  get cur() { return this.slides[1]; }

  _build() {
    if (this.d) return;
    const t = this.g.o.text;
    const d = document.createElement('dialog');
    d.className = 'ff-lb';
    d.innerHTML =
      '<div class="ff-lb__bg"></div><div class="ff-lb__stage"><div class="ff-lb__track"></div></div>' +
      '<div class="ff-lb__bar ff-lb__ui"><span class="ff-lb__count"></span><p class="ff-lb__cap"></p></div>' +
      `<button type="button" class="ff-lb__btn ff-lb__prev ff-lb__ui">${icon(ICONS.prev)}</button>` +
      `<button type="button" class="ff-lb__btn ff-lb__next ff-lb__ui">${icon(ICONS.next)}</button>` +
      `<button type="button" class="ff-lb__btn ff-lb__close ff-lb__ui">${icon(ICONS.close)}</button>`;
    const $ = s => d.querySelector(s);
    this.d = d;
    this.bg = $('.ff-lb__bg');
    this.stage = $('.ff-lb__stage');
    this.track = $('.ff-lb__track');
    this.count = $('.ff-lb__count');
    this.cap = $('.ff-lb__cap');
    this.prevBtn = $('.ff-lb__prev');
    this.nextBtn = $('.ff-lb__next');
    this.closeBtn = $('.ff-lb__close');
    // Labels are set as attributes, never interpolated into HTML.
    d.setAttribute('aria-label', t.viewer);
    this.prevBtn.setAttribute('aria-label', t.prev);
    this.nextBtn.setAttribute('aria-label', t.next);
    this.closeBtn.setAttribute('aria-label', t.close);
    this.count.setAttribute('aria-live', 'polite');

    for (let k = 0; k < 3; k++) {
      const el = document.createElement('div');
      el.className = 'ff-lb__slide';
      const img = document.createElement('img');
      img.className = 'ff-lb__img';
      img.alt = '';
      img.draggable = false;
      img.decoding = 'async';
      el.appendChild(img);
      this.track.appendChild(el);
      this.slides.push({ el, img, index: -1, fit: null, tok: 0, full: false });
    }

    this.prevBtn.addEventListener('click', () => this.go(-1));
    this.nextBtn.addEventListener('click', () => this.go(1));
    this.closeBtn.addEventListener('click', () => this.close());
    d.addEventListener('cancel', e => { e.preventDefault(); this.close(); });
    d.addEventListener('close', () => this._finish());
    d.addEventListener('keydown', e => this._key(e));
    d.addEventListener('wheel', e => this._wheel(e), { passive: false });
    const s = this.stage;
    s.addEventListener('pointerdown', e => this._down(e));
    s.addEventListener('pointermove', e => this._move(e));
    s.addEventListener('pointerup', e => this._up(e));
    s.addEventListener('pointercancel', e => this._up(e, true));
    this._onResize = () => { if (this.isOpen) { this._resetZoom(); this._place(); } };
    this._onPop = () => {
      if (this._ignorePop) { this._ignorePop = false; return; }
      if (this.isOpen) { this._pushed = false; this.close(); }
    };
    document.body.appendChild(d);
  }

  // ---- geometry ----------------------------------------------------------

  _vw() { return window.innerWidth; }
  _vh() { return window.innerHeight; }

  _fit(item, img) {
    const vw = this._vw(), vh = this._vh();
    const roomy = vw > 720 && matchMedia('(hover:hover)').matches;
    // On large screens leave room for the arrows and the caption bar.
    const padX = roomy ? 72 : 0, padTop = roomy ? 24 : 0, padBottom = roomy ? 64 : 0;
    let w = item.w, h = item.h;
    if (!(w > 0 && h > 0) && img && img.naturalWidth) { w = img.naturalWidth; h = img.naturalHeight; }
    if (!(w > 0 && h > 0)) { w = 1; h = 1; }
    const availH = vh - padTop - padBottom;
    const s = Math.min((vw - padX * 2) / w, availH / h);
    const fw = Math.max(1, Math.round(w * s)), fh = Math.max(1, Math.round(h * s));
    return { x: Math.round((vw - fw) / 2), y: Math.round(padTop + (availH - fh) / 2), w: fw, h: fh };
  }

  _place() {
    const vw = this._vw();
    this.slides.forEach((s, k) => {
      s.el.style.transform = `translateX(${(k - 1) * (vw + GAP)}px)`;
      s.img.classList.toggle('is-current', k === 1);
      if (s.index >= 0) this._applyFit(s);
    });
    this.track.style.transform = '';
  }

  _applyFit(s) {
    const item = this.g.items[s.index];
    if (!item) return;
    s.fit = this._fit(item, s.img);
    const st = s.img.style;
    st.left = s.fit.x + 'px'; st.top = s.fit.y + 'px';
    st.width = s.fit.w + 'px'; st.height = s.fit.h + 'px';
  }

  // ---- content -----------------------------------------------------------

  _setSlide(k, index) {
    const s = this.slides[k];
    const items = this.g.items;
    s.index = index;
    s.full = false;
    const tok = (s.tok = ++this.seq);
    const img = s.img;
    img.style.transform = '';
    if (index < 0 || index >= items.length) {
      img.removeAttribute('src');
      img.style.display = 'none';
      return;
    }
    const item = items[index];
    img.style.display = '';
    img.style.backgroundColor = item.color || '';
    img.style.backgroundImage = item.lqip ? `url("${item.lqip}")` : '';
    img.removeAttribute('src');
    this._applyFit(s);

    // 1) Show the thumbnail the grid already loaded, so opening is instant.
    const node = this.g.nodes.get(index);
    const shown = node && node.firstChild.getAttribute('src');
    if (shown) img.src = shown;
    else resolve(this.g._thumbFor(item, 480), u => { if (s.tok === tok && !s.full && u) img.src = u; });

    // 2) Swap in the full-size image once it has decoded.
    this._loadFull(s, tok, s.fit.w);
    img.onload = () => {
      if (s.tok !== tok) return;
      if (!(item.w > 0 && item.h > 0) && img.naturalWidth) {
        item.w = img.naturalWidth; item.h = img.naturalHeight;
        this._applyFit(s);
      }
    };
  }

  _loadFull(s, tok, cssWidth) {
    const item = this.g.items[s.index];
    if (!item) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    resolve(this.g._fullFor(item, Math.ceil(cssWidth * dpr)), u => {
      if (!u || s.tok !== tok) return;
      if (s.img.getAttribute('src') === u) { s.full = true; return; }
      const pre = new Image();
      pre.decoding = 'async';
      pre.src = u;
      const swap = () => { if (s.tok === tok) { s.img.src = u; s.full = true; } };
      (pre.decode ? pre.decode() : Promise.resolve()).then(swap, swap);
    });
  }

  _ui() {
    const g = this.g, n = g.items.length, item = g.items[this.i];
    this.count.textContent = `${this.i + 1} / ${n}${g.done ? '' : '+'}`;
    this.cap.textContent = item ? (item.caption || item.alt) : '';
    this.cap.hidden = !this.g.o.captions || !this.cap.textContent;
    this.prevBtn.hidden = this.i <= 0;
    this.nextBtn.hidden = this.i >= n - 1 && g.done;
    if (!g.done && this.i >= n - 4) g.loadMore();
  }

  /** Called by the gallery when new items arrive while the viewer is open. */
  refresh() {
    if (!this.isOpen) return;
    const n = this.g.items.length;
    this.slides.forEach((s, k) => {
      const want = this.i + k - 1;
      if (want >= 0 && want < n && s.index !== want) this._setSlide(k, want);
    });
    this._ui();
  }

  // ---- open / close ------------------------------------------------------

  open(index) {
    const items = this.g.items;
    if (!(index >= 0 && index < items.length)) return;
    this._build();
    if (this.isOpen) { this.jump(index); return; }
    this.isOpen = true;
    this.i = index;
    this._resetZoom();
    this.d.classList.remove('is-chromeless');
    this.returnFocus = this.g.nodes.get(index) || document.activeElement;
    this._place();
    this._setSlide(0, index - 1);
    this._setSlide(1, index);
    this._setSlide(2, index + 1);
    this._place();
    this._ui();
    this.d.showModal();
    this.closeBtn.focus({ preventScroll: true });

    window.addEventListener('resize', this._onResize);
    if (this.g.o.history) {
      window.addEventListener('popstate', this._onPop);
      this._ignorePop = false;
      history.pushState(Object.assign({}, history.state, { frameflow: true }), '');
      this._pushed = true;
    }

    const node = this.g.nodes.get(index);
    if (node && !reduced()) {
      const from = this._flip(node.getBoundingClientRect(), this.cur.fit);
      this.cur.img.animate([{ transform: from }, { transform: 'none' }],
        { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
      this.bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' });
      this.d.querySelectorAll('.ff-lb__ui').forEach(el =>
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 120, fill: 'backwards' }));
    }
    this.g._emit('open', { index, item: items[index].data });
  }

  jump(index) {
    if (!(index >= 0 && index < this.g.items.length)) return;
    this.i = index;
    this._resetZoom();
    this._setSlide(0, index - 1);
    this._setSlide(1, index);
    this._setSlide(2, index + 1);
    this._place();
    this._ui();
    this.g._emit('change', { index, item: this.g.items[index].data });
  }

  _flip(r, fit) {
    const dx = r.left + r.width / 2 - (fit.x + fit.w / 2);
    const dy = r.top + r.height / 2 - (fit.y + fit.h / 2);
    return `translate(${dx}px,${dy}px) scale(${r.width / fit.w},${r.height / fit.h})`;
  }

  async close() {
    if (!this.isOpen || this.closing) return;
    this.closing = true;
    if (this._pushed) { this._pushed = false; this._ignorePop = true; history.back(); }
    const cur = this.cur;
    const node = this.g.reveal(this.i);
    if (node && cur.fit && !reduced()) {
      const fromT = getComputedStyle(cur.img).transform;
      const to = this._flip(node.getBoundingClientRect(), cur.fit);
      const bgFrom = getComputedStyle(this.bg).opacity;
      const a = cur.img.animate([{ transform: fromT === 'none' ? 'none' : fromT }, { transform: to }],
        { duration: 260, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      this.bg.animate([{ opacity: bgFrom }, { opacity: 0 }], { duration: 240, fill: 'forwards' });
      this.d.querySelectorAll('.ff-lb__ui').forEach(el =>
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }));
      try { await a.finished; } catch { /* interrupted */ }
    }
    if (this.d.open) this.d.close(); // fires 'close' -> _finish()
    else this._finish();
  }

  _finish() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.closing = false;
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('popstate', this._onPop);
    if (this._pushed) { this._pushed = false; this._ignorePop = true; history.back(); }
    this.d.getAnimations({ subtree: true }).forEach(a => a.cancel());
    this.bg.style.opacity = '';
    this.slides.forEach(s => { s.tok = ++this.seq; s.img.removeAttribute('src'); s.img.style.transform = ''; });
    this.pointers.clear();
    const f = this.g.nodes.get(this.i) || this.returnFocus;
    if (f && f.isConnected) f.focus({ preventScroll: true });
    this.g._emit('close', { index: this.i });
  }

  destroy() {
    if (this.isOpen) { this.closing = true; if (this.d.open) this.d.close(); this._finish(); }
    if (this.d) this.d.remove();
    this.d = null;
  }

  // ---- navigation --------------------------------------------------------

  go(delta, fromDx = 0) {
    const n = this.g.items.length;
    const ni = this.i + delta;
    if (this.animating) return;
    if (ni < 0 || ni >= n) { this._snapTrack(fromDx); if (ni >= n) this.g.loadMore(); return; }
    this.animating = true;
    const vw = this._vw();
    const done = () => {
      this.animating = false;
      this._resetZoom();
      if (delta > 0) this.slides.push(this.slides.shift());
      else this.slides.unshift(this.slides.pop());
      this.i = ni;
      this._place();
      this._setSlide(delta > 0 ? 2 : 0, ni + delta);
      this._ui();
      this.g._emit('change', { index: ni, item: this.g.items[ni].data });
    };
    if (reduced()) { done(); return; }
    const anim = this.track.animate(
      [{ transform: `translateX(${fromDx}px)` }, { transform: `translateX(${-delta * (vw + GAP)}px)` }],
      { duration: fromDx ? 220 : 300, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    anim.finished.then(() => { anim.cancel(); done(); }, () => { this.animating = false; });
  }

  _snapTrack(fromDx) {
    if (!fromDx) { this.track.style.transform = ''; return; }
    const a = this.track.animate([{ transform: `translateX(${fromDx}px)` }, { transform: 'translateX(0)' }],
      { duration: 220, easing: 'ease-out' });
    this.track.style.transform = '';
    return a;
  }

  _key(e) {
    if (e.target && e.target.closest && e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
    const vw = this._vw(), vh = this._vh();
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': this.go(1); break;
      case 'ArrowLeft': case 'PageUp': this.go(-1); break;
      case 'Home': this.jump(0); break;
      case 'End': this.jump(this.g.items.length - 1); break;
      case '+': case '=': this.zoomTo(this.z * 1.6, vw / 2, vh / 2, true); break;
      case '-': case '_': this.zoomTo(this.z / 1.6, vw / 2, vh / 2, true); break;
      case '0': this.zoomTo(1, vw / 2, vh / 2, true); break;
      default: return;
    }
    e.preventDefault();
  }

  // ---- zoom --------------------------------------------------------------

  _resetZoom() {
    this.z = 1; this.px = 0; this.py = 0;
    if (this.d) this.d.classList.remove('is-zoomed');
    const s = this.cur;
    if (s) s.img.style.transform = '';
  }

  /** Pan limits that keep a zoomed photo covering the screen. */
  _panRange() {
    const f = this.cur.fit;
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    const fw = f.w * this.z, fh = f.h * this.z, vw = this._vw(), vh = this._vh();
    const ax = fw > vw ? [vw - cx - fw / 2, fw / 2 - cx] : [vw / 2 - cx, vw / 2 - cx];
    const ay = fh > vh ? [vh - cy - fh / 2, fh / 2 - cy] : [vh / 2 - cy, vh / 2 - cy];
    return { ax, ay };
  }

  _clampPan(elastic) {
    if (!this.cur.fit) return;
    if (this.z <= 1.001) { this.px = 0; this.py = 0; return; }
    const { ax, ay } = this._panRange();
    const fit = (v, [lo, hi]) => {
      if (!elastic) return clamp(v, lo, hi);
      if (v < lo) return lo - (lo - v) * 0.3;
      if (v > hi) return hi + (v - hi) * 0.3;
      return v;
    };
    this.px = fit(this.px, ax);
    this.py = fit(this.py, ay);
  }

  _applyZoom(animate) {
    const img = this.cur.img;
    img.style.transition = animate && !reduced() ? 'transform .25s cubic-bezier(.2,.8,.2,1)' : '';
    img.style.transform = this.z === 1 && !this.px && !this.py ? '' :
      `translate(${this.px}px,${this.py}px) scale(${this.z})`;
    this.d.classList.toggle('is-zoomed', this.z > 1.01);
    if (animate) setTimeout(() => { img.style.transition = ''; }, 260);
  }

  /** Zoom so that viewport point (cx, cy) stays under the pointer. */
  zoomTo(z, cx, cy, animate) {
    const s = this.cur;
    if (!s || !s.fit || s.index < 0) return;
    z = clamp(z, 1, MAX_ZOOM);
    const ox = s.fit.x + s.fit.w / 2, oy = s.fit.y + s.fit.h / 2; // photo center at zoom 1
    const k = z / this.z;
    this.px = cx - ox - (cx - ox - this.px) * k;
    this.py = cy - oy - (cy - oy - this.py) * k;
    this.z = z;
    if (z === 1) { this.px = 0; this.py = 0; }
    this._clampPan(false);
    this._applyZoom(animate);
    this._upgrade();
  }

  _upgrade() {
    clearTimeout(this._upT);
    this._upT = setTimeout(() => {
      const s = this.cur;
      if (this.z > 1.2 && s && s.fit) this._loadFull(s, s.tok, s.fit.w * this.z);
    }, 200);
  }

  _wheel(e) {
    e.preventDefault();
    if (e.ctrlKey) { this.zoomTo(this.z * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY, false); return; }
    if (this.z > 1.01) {
      this.px -= e.deltaX; this.py -= e.deltaY;
      this._clampPan(false); this._applyZoom(false);
      return;
    }
    const t = now();
    if (t - this.wheelLast > 200) this.wheelAcc = 0;
    this.wheelLast = t;
    this.wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(this.wheelAcc) > 60 && t > this.wheelCool) {
      this.go(Math.sign(this.wheelAcc));
      this.wheelAcc = 0;
      this.wheelCool = t + 400;
    }
  }

  // ---- pointers: swipe, pan, pinch, dismiss, tap ---------------------------

  _down(e) {
    if (e.button > 0 || this.animating) return;
    if (e.target.closest && e.target.closest('.ff-lb__btn')) return;
    try { this.stage.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.gest = { x: e.clientX, y: e.clientY, t: now(), px: this.px, py: this.py, mode: null, moved: false };
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.track.style.transform = '';
      this.cur.img.style.transform = this.z === 1 ? '' : this.cur.img.style.transform;
      this.pinch = {
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
        z0: this.z, px0: this.px, py0: this.py,
      };
      if (this.gest) { this.gest.mode = 'pinch'; this.gest.moved = true; }
    }
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    const g = this.gest;
    if (!g) return;

    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const P = this.pinch;
      const z = clamp(P.z0 * Math.hypot(a.x - b.x, a.y - b.y) / P.d0, 0.8, MAX_ZOOM);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const f = this.cur.fit, ox = f.x + f.w / 2, oy = f.y + f.h / 2;
      this.px = mx - ox - (P.mx - ox - P.px0) * (z / P.z0);
      this.py = my - oy - (P.my - oy - P.py0) * (z / P.z0);
      this.z = z;
      this._applyZoom(false);
      return;
    }

    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.mode) {
      if (Math.hypot(dx, dy) < 8) return;
      g.moved = true;
      g.mode = this.z > 1.01 ? 'pan' : Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'dismiss';
    }
    if (g.mode === 'pan') {
      this.px = g.px + dx; this.py = g.py + dy;
      this._clampPan(true);
      this._applyZoom(false);
    } else if (g.mode === 'swipe') {
      const blocked = (dx > 0 && this.i <= 0) || (dx < 0 && this.i >= this.g.items.length - 1);
      g.dx = blocked ? dx * 0.3 : dx;
      this.track.style.transform = `translateX(${g.dx}px)`;
    } else if (g.mode === 'dismiss') {
      const vh = this._vh();
      const k = Math.min(1, Math.abs(dy) / vh);
      this.cur.img.style.transform = `translate(${dx * 0.3}px,${dy}px) scale(${1 - k * 0.25})`;
      this.bg.style.opacity = String(1 - k * 1.4);
    }
  }

  _up(e, cancelled) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const g = this.gest;

    if (this.pinch) {
      if (this.pointers.size < 2) {
        this.pinch = null;
        if (this.z < 1.05) this.zoomTo(1, this._vw() / 2, this._vh() / 2, true);
        else { this._clampPan(false); this._applyZoom(true); this._upgrade(); }
        const rest = [...this.pointers.values()][0];
        this.gest = rest ? { x: rest.x, y: rest.y, t: now(), px: this.px, py: this.py, mode: 'pan', moved: true } : null;
      }
      return;
    }
    if (this.pointers.size || !g) return;
    this.gest = null;
    const dt = Math.max(1, now() - g.t);
    const dx = e.clientX - g.x, dy = e.clientY - g.y;

    if (!g.moved) { if (!cancelled) this._tap(e); return; }
    if (g.mode === 'pan') { this._clampPan(false); this._applyZoom(true); return; }
    if (g.mode === 'swipe') {
      const vw = this._vw(), v = dx / dt;
      const sdx = g.dx || 0;
      if (!cancelled && (dx < -vw * 0.18 || v < -0.45) && this.i < this.g.items.length - 1) this.go(1, sdx);
      else if (!cancelled && (dx > vw * 0.18 || v > 0.45) && this.i > 0) this.go(-1, sdx);
      else this._snapTrack(sdx);
      return;
    }
    if (g.mode === 'dismiss') {
      if (!cancelled && (Math.abs(dy) > this._vh() * 0.14 || Math.abs(dy / dt) > 0.6)) { this.close(); return; }
      const img = this.cur.img, from = img.style.transform;
      img.style.transform = '';
      img.animate([{ transform: from }, { transform: 'none' }], { duration: 200, easing: 'ease-out' });
      const op = this.bg.style.opacity || '1';
      this.bg.style.opacity = '';
      this.bg.animate([{ opacity: op }, { opacity: 1 }], { duration: 200 });
    }
  }

  _tap(e) {
    const t = now(), x = e.clientX, y = e.clientY;
    const L = this.lastTap;
    if (L && t - L.t < 300 && Math.hypot(x - L.x, y - L.y) < 30) {
      clearTimeout(this.tapTimer);
      this.lastTap = null;
      this.zoomTo(this.z > 1.01 ? 1 : 2.5, x, y, true);
      return;
    }
    const onImage = e.target === this.cur.img;
    this.lastTap = { t, x, y };
    clearTimeout(this.tapTimer);
    this.tapTimer = setTimeout(() => {
      this.lastTap = null;
      if (onImage || this.z > 1.01) this.d.classList.toggle('is-chromeless');
      else this.close();
    }, 260);
  }
}
