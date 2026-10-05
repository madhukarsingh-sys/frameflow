/*! Frameflow v1.0.0 | MIT License */

// src/layout.js
var MIN_RATIO = 0.25;
var MAX_RATIO = 5;
function ratioOf(item) {
  const w = item && item.w, h = item && item.h;
  if (w > 0 && h > 0 && Number.isFinite(w / h)) {
    return Math.min(MAX_RATIO, Math.max(MIN_RATIO, w / h));
  }
  return 1;
}
function layout(items, width, opts = {}) {
  const W = Math.floor(Number(width) || 0);
  const gap = Math.max(0, Number(opts.gap) || 0);
  if (!items || !items.length || W <= 0) return { boxes: [], height: 0 };
  switch (opts.mode) {
    case "masonry":
      return masonry(items, W, gap, opts.columnWidth || 240);
    case "grid":
      return grid(items, W, gap, opts.columnWidth || 240);
    default:
      return justified(items, W, gap, opts.rowHeight || 220);
  }
}
function justified(items, W, gap, target) {
  const boxes = new Array(items.length);
  const maxH = target * 1.5;
  let y = 0;
  let row = [];
  let sum = 0;
  const place = (indices, h, fill) => {
    h = Math.max(1, h);
    let xf = 0;
    const hr = Math.round(h);
    indices.forEach((idx, k) => {
      const wf = ratioOf(items[idx]) * h;
      const left = Math.round(xf);
      const isLast = k === indices.length - 1;
      const right = fill && isLast ? W : Math.min(W, Math.round(xf + wf));
      boxes[idx] = { x: left, y, w: Math.max(1, right - left), h: hr };
      xf += wf + gap;
    });
    y += hr + gap;
  };
  const rowHeight = (n, s) => (W - gap * (n - 1)) / s;
  for (let i = 0; i < items.length; i++) {
    const r = ratioOf(items[i]);
    row.push(i);
    sum += r;
    const h = rowHeight(row.length, sum);
    if (h > target) continue;
    if (row.length > 1) {
      const hPrev = rowHeight(row.length - 1, sum - r);
      if (hPrev <= maxH && hPrev / target < target / h) {
        row.pop();
        place(row, hPrev, true);
        row = [i];
        sum = r;
        const hSolo = rowHeight(1, sum);
        if (hSolo <= target) {
          place(row, hSolo, true);
          row = [];
          sum = 0;
        }
        continue;
      }
    }
    place(row, h, true);
    row = [];
    sum = 0;
  }
  if (row.length) place(row, Math.min(target, rowHeight(row.length, sum)), false);
  return { boxes, height: Math.max(0, y - gap) };
}
function columns(W, gap, colWidth) {
  const cols = Math.max(1, Math.floor((W + gap) / (colWidth + gap)));
  const cw = (W - gap * (cols - 1)) / cols;
  return { cols, cw };
}
function masonry(items, W, gap, colWidth) {
  const { cols, cw } = columns(W, gap, colWidth);
  const heights = new Array(cols).fill(0);
  const boxes = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    let c = 0;
    for (let k = 1; k < cols; k++) if (heights[k] < heights[c] - 0.5) c = k;
    const left = Math.round(c * (cw + gap));
    const right = c === cols - 1 ? W : Math.round(c * (cw + gap) + cw);
    const h = Math.max(1, Math.round(cw / ratioOf(items[i])));
    boxes[i] = { x: left, y: heights[c], w: right - left, h };
    heights[c] += h + gap;
  }
  return { boxes, height: Math.max(0, Math.max(...heights) - gap) };
}
function grid(items, W, gap, colWidth) {
  const { cols, cw } = columns(W, gap, colWidth);
  const size = Math.round(cw);
  const boxes = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const left = Math.round(c * (cw + gap));
    const right = c === cols - 1 ? W : Math.round(c * (cw + gap) + cw);
    boxes[i] = { x: left, y: r * (size + gap), w: right - left, h: size };
  }
  const rows = Math.ceil(items.length / cols);
  return { boxes, height: rows * (size + gap) - gap };
}

// src/items.js
var DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i;
var ALLOWED = /* @__PURE__ */ new Set(["http:", "https:", "blob:"]);
function base() {
  return typeof document !== "undefined" && document.baseURI || typeof location !== "undefined" && location.href || "http://localhost/";
}
function safeUrl(u) {
  if (typeof u !== "string") return null;
  u = u.trim();
  if (!u) return null;
  if (DATA_IMAGE.test(u)) return u;
  if (u.length > 8192) return null;
  try {
    return ALLOWED.has(new URL(u, base()).protocol) ? u : null;
  } catch {
    return null;
  }
}
function safeFetchUrl(u, relativeTo) {
  if (typeof u !== "string" || !u.trim()) return null;
  try {
    const url = new URL(u.trim(), relativeTo || base());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
function text(v, max) {
  if (v == null) return "";
  return String(v).replace(/\s+/g, " ").trim().slice(0, max);
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 1e6 ? n : 0;
}
function color(v) {
  if (typeof v !== "string" || v.length > 64) return "";
  const c = v.trim();
  if (typeof CSS !== "undefined" && CSS.supports) return CSS.supports("color", c) ? c : "";
  return /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/+-]+\))$/i.test(c) ? c : "";
}
function parseSrcset(v) {
  let list = [];
  if (Array.isArray(v)) {
    list = v.map((c) => c && { url: safeUrl(c.src || c.url), w: num(c.w || c.width) });
  } else if (typeof v === "string") {
    list = v.split(/,\s+/).map((part) => {
      const m = part.trim().match(/^(\S+)\s+(\d+)w$/);
      return m && { url: safeUrl(m[1]), w: num(m[2]) };
    });
  }
  return list.filter((c) => c && c.url && c.w).sort((a, b) => a.w - b.w);
}
function pickCandidate(candidates, need) {
  if (!candidates.length) return null;
  for (const c of candidates) if (c.w >= need) return c.url;
  return candidates[candidates.length - 1].url;
}
function normalizeItem(raw, allowNoUrl = false) {
  if (typeof raw === "string") raw = { src: raw };
  if (!raw || typeof raw !== "object") return null;
  const src = safeUrl(raw.src || raw.url || raw.full);
  const thumb = safeUrl(raw.thumb || raw.thumbnail);
  const srcset = parseSrcset(raw.srcset);
  if (!src && !thumb && !srcset.length && !allowNoUrl) return null;
  const lqip = typeof raw.lqip === "string" && DATA_IMAGE.test(raw.lqip) && !/["'\\\s)]/.test(raw.lqip) ? raw.lqip : "";
  return {
    src: src || thumb || (srcset.length ? srcset[srcset.length - 1].url : ""),
    thumb,
    srcset,
    w: num(raw.w || raw.width),
    h: num(raw.h || raw.height),
    alt: text(raw.alt, 500),
    caption: text(raw.caption != null ? raw.caption : raw.title, 2e3),
    color: color(raw.color),
    lqip,
    id: raw.id != null ? text(raw.id, 200) : "",
    data: raw
  };
}

// src/source.js
var MAX_EMPTY_PAGES = 3;
function pickItems(r) {
  if (Array.isArray(r)) return r;
  if (r && typeof r === "object") {
    for (const k of ["items", "photos", "images", "data", "results"]) {
      if (Array.isArray(r[k])) return r[k];
    }
  }
  return [];
}
function pickNext(r) {
  if (!r || typeof r !== "object" || Array.isArray(r)) return { has: false, value: null, url: false };
  for (const k of ["next", "nextUrl"]) if (k in r) return { has: true, value: r[k] || null, url: true };
  for (const k of ["nextPageToken", "cursor"]) if (k in r) return { has: true, value: r[k] || null, url: false };
  return { has: false, value: null, url: false };
}
function createSource(o) {
  if (typeof o.source === "function") return functionSource(o.source);
  if (typeof o.src === "string" && o.src.trim()) return jsonSource(o.src.trim(), o);
  return null;
}
function functionSource(fn) {
  let page = 1;
  let cursor = null;
  let empties = 0;
  return {
    async next(signal) {
      const r = await fn({ page, cursor, signal });
      page++;
      const items = pickItems(r);
      const nx = pickNext(r);
      if (nx.has) cursor = nx.value;
      empties = items.length ? 0 : empties + 1;
      const done = r && r.done === true || nx.has && !nx.value || !items.length && (!nx.has || empties >= MAX_EMPTY_PAGES);
      return { items, done };
    }
  };
}
function jsonSource(template, o) {
  const paged = template.includes("{page}");
  let page = 1;
  let nextUrl = null;
  let empties = 0;
  return {
    async next(signal) {
      const raw = nextUrl || template.split("{page}").join(String(page));
      const url = safeFetchUrl(raw);
      if (!url) throw new Error("Frameflow: refusing to fetch an invalid or non-http(s) URL");
      const res = await fetch(url, {
        signal,
        credentials: o.credentials || "same-origin",
        headers: { Accept: "application/json" }
      });
      if (!res.ok) throw new Error(`Frameflow: ${url} answered HTTP ${res.status}`);
      const r = await res.json();
      page++;
      const items = pickItems(r);
      const nx = pickNext(r);
      nextUrl = null;
      if (nx.has && nx.value) {
        const v = String(nx.value);
        nextUrl = nx.url ? safeFetchUrl(v, url) : withParam(url, o.cursorParam || "cursor", v);
      }
      empties = items.length ? 0 : empties + 1;
      let done;
      if (nx.has) done = !nextUrl;
      else if (paged) done = !items.length || empties >= MAX_EMPTY_PAGES;
      else done = true;
      if (r && r.done === true) done = true;
      return { items, done };
    }
  };
}
function withParam(href, key, value) {
  const u = new URL(href);
  u.searchParams.set(key, value);
  return u.href;
}

// src/styles.js
var CSS2 = `
.ff{position:relative;display:block;box-sizing:border-box}
.ff--frame{overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;scrollbar-gutter:stable}
.ff__canvas{position:relative;width:100%;contain:strict}
.ff__tile{position:absolute;left:0;top:0;margin:0;padding:0;border:0;cursor:zoom-in;overflow:hidden;
  border-radius:var(--ff-radius,4px);background:var(--ff-placeholder,#8883) center/cover no-repeat;
  -webkit-tap-highlight-color:transparent;will-change:transform;contain:strict}
.ff__tile:focus{outline:none}
.ff__tile:focus-visible{outline:3px solid var(--ff-focus,#2b6fff);outline-offset:2px;z-index:1}
.ff__tile img{display:block;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity var(--ff-fade,260ms) ease;user-select:none;-webkit-user-drag:none}
.ff__tile img.is-loaded{opacity:1}
.ff__tile.is-error{background-image:none}
.ff__tile.is-error::after{content:"";position:absolute;inset:0;margin:auto;width:28px;height:28px;opacity:.45;
  background:currentColor;-webkit-mask:var(--ff-broken) center/contain no-repeat;mask:var(--ff-broken) center/contain no-repeat}
.ff{--ff-broken:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cpath d='M3 16l5-5 4 4M14 13l2-2 5 5M4 4l16 16'/%3E%3C/svg%3E")}
.ff__status{display:flex;align-items:center;justify-content:center;gap:.6em;min-height:64px;padding:12px;
  color:var(--ff-status-color,currentColor);font:inherit;font-size:.9em;opacity:.75;text-align:center}
.ff__status:empty{min-height:0;padding:0}
.ff__spin{width:18px;height:18px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:ff-spin .8s linear infinite}
.ff__retry{font:inherit;color:inherit;background:none;border:1px solid currentColor;border-radius:999px;padding:.35em 1em;cursor:pointer}
.ff__retry:focus-visible{outline:3px solid var(--ff-focus,#2b6fff);outline-offset:2px}
@keyframes ff-spin{to{transform:rotate(360deg)}}

.ff-lb{position:fixed;inset:0;width:100vw;height:100vh;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;
  background:transparent;color:var(--ff-lb-fg,#fff);overflow:hidden;overscroll-behavior:contain;font:inherit}
.ff-lb::backdrop{background:transparent}
.ff-lb:focus{outline:none}
.ff-lb__bg{position:absolute;inset:0;background:var(--ff-lb-bg,#090b0dfa)}
.ff-lb__stage{position:absolute;inset:0;touch-action:none;user-select:none;-webkit-user-select:none}
.ff-lb__track{position:absolute;inset:0;will-change:transform}
.ff-lb__slide{position:absolute;inset:0;overflow:hidden}
.ff-lb__img{position:absolute;left:0;top:0;transform-origin:50% 50%;will-change:transform;-webkit-user-drag:none;user-select:none;
  background:var(--ff-placeholder,#8883) center/cover no-repeat;max-width:none}
.ff-lb.is-zoomed .ff-lb__img.is-current{cursor:grab}
.ff-lb__ui{transition:opacity .2s ease}
.ff-lb.is-chromeless .ff-lb__ui{opacity:0;pointer-events:none}
.ff-lb__btn{position:absolute;display:grid;place-items:center;width:48px;height:48px;padding:0;border:0;border-radius:50%;
  background:#0006;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.ff-lb__btn svg{width:24px;height:24px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ff-lb__btn:hover{background:#000a}
.ff-lb__btn:focus-visible{outline:3px solid var(--ff-focus,#2b6fff);outline-offset:2px}
.ff-lb__btn[hidden]{display:none}
.ff-lb__close{top:max(12px,env(safe-area-inset-top));right:12px}
.ff-lb__prev,.ff-lb__next{top:50%;margin-top:-24px}
.ff-lb__prev{left:12px}.ff-lb__next{right:12px}
.ff-lb__bar{position:absolute;left:0;right:0;bottom:0;padding:28px 16px max(14px,env(safe-area-inset-bottom));
  background:linear-gradient(transparent,#0008);pointer-events:none;display:flex;gap:1em;align-items:baseline}
.ff-lb__count{flex:none;font-variant-numeric:tabular-nums;opacity:.8;font-size:.9em}
.ff-lb__cap{margin:0;flex:1;min-width:0;font-size:.95em;line-height:1.4}
@media (hover:none){.ff-lb__prev,.ff-lb__next{display:none}}
@media (prefers-reduced-motion:reduce){.ff__tile img{transition:none}.ff__spin{animation-duration:2s}}
`;
function injectStyles(nonce) {
  if (typeof document === "undefined" || document.getElementById("frameflow-css")) return;
  const s = document.createElement("style");
  s.id = "frameflow-css";
  if (nonce) s.nonce = nonce;
  s.textContent = CSS2;
  document.head.appendChild(s);
}

// src/lightbox.js
var MAX_ZOOM = 4;
var GAP = 24;
var ICONS = {
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>'
};
var icon = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
var clamp = (v, a, b) => Math.min(b, Math.max(a, v));
var now = () => performance.now();
var reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
var thenable = (v) => v && typeof v.then === "function";
var resolve = (v, fn) => thenable(v) ? v.then(fn, () => {
}) : fn(v);
var Lightbox = class {
  constructor(gallery) {
    this.g = gallery;
    this.i = -1;
    this.isOpen = false;
    this.z = 1;
    this.px = 0;
    this.py = 0;
    this.pointers = /* @__PURE__ */ new Map();
    this.slides = [];
    this.seq = 0;
    this.wheelAcc = 0;
    this.wheelCool = 0;
    this.wheelLast = 0;
  }
  get cur() {
    return this.slides[1];
  }
  _build() {
    if (this.d) return;
    const t = this.g.o.text;
    const d = document.createElement("dialog");
    d.className = "ff-lb";
    d.innerHTML = `<div class="ff-lb__bg"></div><div class="ff-lb__stage"><div class="ff-lb__track"></div></div><div class="ff-lb__bar ff-lb__ui"><span class="ff-lb__count"></span><p class="ff-lb__cap"></p></div><button type="button" class="ff-lb__btn ff-lb__prev ff-lb__ui">${icon(ICONS.prev)}</button><button type="button" class="ff-lb__btn ff-lb__next ff-lb__ui">${icon(ICONS.next)}</button><button type="button" class="ff-lb__btn ff-lb__close ff-lb__ui">${icon(ICONS.close)}</button>`;
    const $ = (s2) => d.querySelector(s2);
    this.d = d;
    this.bg = $(".ff-lb__bg");
    this.stage = $(".ff-lb__stage");
    this.track = $(".ff-lb__track");
    this.count = $(".ff-lb__count");
    this.cap = $(".ff-lb__cap");
    this.prevBtn = $(".ff-lb__prev");
    this.nextBtn = $(".ff-lb__next");
    this.closeBtn = $(".ff-lb__close");
    d.setAttribute("aria-label", t.viewer);
    this.prevBtn.setAttribute("aria-label", t.prev);
    this.nextBtn.setAttribute("aria-label", t.next);
    this.closeBtn.setAttribute("aria-label", t.close);
    this.count.setAttribute("aria-live", "polite");
    for (let k = 0; k < 3; k++) {
      const el = document.createElement("div");
      el.className = "ff-lb__slide";
      const img = document.createElement("img");
      img.className = "ff-lb__img";
      img.alt = "";
      img.draggable = false;
      img.decoding = "async";
      el.appendChild(img);
      this.track.appendChild(el);
      this.slides.push({ el, img, index: -1, fit: null, tok: 0, full: false });
    }
    this.prevBtn.addEventListener("click", () => this.go(-1));
    this.nextBtn.addEventListener("click", () => this.go(1));
    this.closeBtn.addEventListener("click", () => this.close());
    d.addEventListener("cancel", (e) => {
      e.preventDefault();
      this.close();
    });
    d.addEventListener("close", () => this._finish());
    d.addEventListener("keydown", (e) => this._key(e));
    d.addEventListener("wheel", (e) => this._wheel(e), { passive: false });
    const s = this.stage;
    s.addEventListener("pointerdown", (e) => this._down(e));
    s.addEventListener("pointermove", (e) => this._move(e));
    s.addEventListener("pointerup", (e) => this._up(e));
    s.addEventListener("pointercancel", (e) => this._up(e, true));
    this._onResize = () => {
      if (this.isOpen) {
        this._resetZoom();
        this._place();
      }
    };
    this._onPop = () => {
      if (this._ignorePop) {
        this._ignorePop = false;
        return;
      }
      if (this.isOpen) {
        this._pushed = false;
        this.close();
      }
    };
    document.body.appendChild(d);
  }
  // ---- geometry ----------------------------------------------------------
  _vw() {
    return window.innerWidth;
  }
  _vh() {
    return window.innerHeight;
  }
  _fit(item, img) {
    const vw = this._vw(), vh = this._vh();
    const roomy = vw > 720 && matchMedia("(hover:hover)").matches;
    const padX = roomy ? 72 : 0, padTop = roomy ? 24 : 0, padBottom = roomy ? 64 : 0;
    let w = item.w, h = item.h;
    if (!(w > 0 && h > 0) && img && img.naturalWidth) {
      w = img.naturalWidth;
      h = img.naturalHeight;
    }
    if (!(w > 0 && h > 0)) {
      w = 1;
      h = 1;
    }
    const availH = vh - padTop - padBottom;
    const s = Math.min((vw - padX * 2) / w, availH / h);
    const fw = Math.max(1, Math.round(w * s)), fh = Math.max(1, Math.round(h * s));
    return { x: Math.round((vw - fw) / 2), y: Math.round(padTop + (availH - fh) / 2), w: fw, h: fh };
  }
  _place() {
    const vw = this._vw();
    this.slides.forEach((s, k) => {
      s.el.style.transform = `translateX(${(k - 1) * (vw + GAP)}px)`;
      s.img.classList.toggle("is-current", k === 1);
      if (s.index >= 0) this._applyFit(s);
    });
    this.track.style.transform = "";
  }
  _applyFit(s) {
    const item = this.g.items[s.index];
    if (!item) return;
    s.fit = this._fit(item, s.img);
    const st = s.img.style;
    st.left = s.fit.x + "px";
    st.top = s.fit.y + "px";
    st.width = s.fit.w + "px";
    st.height = s.fit.h + "px";
  }
  // ---- content -----------------------------------------------------------
  _setSlide(k, index) {
    const s = this.slides[k];
    const items = this.g.items;
    s.index = index;
    s.full = false;
    const tok = s.tok = ++this.seq;
    const img = s.img;
    img.style.transform = "";
    if (index < 0 || index >= items.length) {
      img.removeAttribute("src");
      img.style.display = "none";
      return;
    }
    const item = items[index];
    img.style.display = "";
    img.style.backgroundColor = item.color || "";
    img.style.backgroundImage = item.lqip ? `url("${item.lqip}")` : "";
    img.removeAttribute("src");
    this._applyFit(s);
    const node = this.g.nodes.get(index);
    const shown = node && node.firstChild.getAttribute("src");
    if (shown) img.src = shown;
    else resolve(this.g._thumbFor(item, 480), (u) => {
      if (s.tok === tok && !s.full && u) img.src = u;
    });
    this._loadFull(s, tok, s.fit.w);
    img.onload = () => {
      if (s.tok !== tok) return;
      if (!(item.w > 0 && item.h > 0) && img.naturalWidth) {
        item.w = img.naturalWidth;
        item.h = img.naturalHeight;
        this._applyFit(s);
      }
    };
  }
  _loadFull(s, tok, cssWidth) {
    const item = this.g.items[s.index];
    if (!item) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    resolve(this.g._fullFor(item, Math.ceil(cssWidth * dpr)), (u) => {
      if (!u || s.tok !== tok) return;
      if (s.img.getAttribute("src") === u) {
        s.full = true;
        return;
      }
      const pre = new Image();
      pre.decoding = "async";
      pre.src = u;
      const swap = () => {
        if (s.tok === tok) {
          s.img.src = u;
          s.full = true;
        }
      };
      (pre.decode ? pre.decode() : Promise.resolve()).then(swap, swap);
    });
  }
  _ui() {
    const g = this.g, n = g.items.length, item = g.items[this.i];
    this.count.textContent = `${this.i + 1} / ${n}${g.done ? "" : "+"}`;
    this.cap.textContent = item ? item.caption || item.alt : "";
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
    if (this.isOpen) {
      this.jump(index);
      return;
    }
    this.isOpen = true;
    this.i = index;
    this._resetZoom();
    this.d.classList.remove("is-chromeless");
    this.returnFocus = this.g.nodes.get(index) || document.activeElement;
    this._place();
    this._setSlide(0, index - 1);
    this._setSlide(1, index);
    this._setSlide(2, index + 1);
    this._place();
    this._ui();
    this.d.showModal();
    this.closeBtn.focus({ preventScroll: true });
    window.addEventListener("resize", this._onResize);
    if (this.g.o.history) {
      window.addEventListener("popstate", this._onPop);
      this._ignorePop = false;
      history.pushState(Object.assign({}, history.state, { frameflow: true }), "");
      this._pushed = true;
    }
    const node = this.g.nodes.get(index);
    if (node && !reduced()) {
      const from = this._flip(node.getBoundingClientRect(), this.cur.fit);
      this.cur.img.animate(
        [{ transform: from }, { transform: "none" }],
        { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" }
      );
      this.bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease-out" });
      this.d.querySelectorAll(".ff-lb__ui").forEach((el) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 120, fill: "backwards" }));
    }
    this.g._emit("open", { index, item: items[index].data });
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
    this.g._emit("change", { index, item: this.g.items[index].data });
  }
  _flip(r, fit) {
    const dx = r.left + r.width / 2 - (fit.x + fit.w / 2);
    const dy = r.top + r.height / 2 - (fit.y + fit.h / 2);
    return `translate(${dx}px,${dy}px) scale(${r.width / fit.w},${r.height / fit.h})`;
  }
  async close() {
    if (!this.isOpen || this.closing) return;
    this.closing = true;
    if (this._pushed) {
      this._pushed = false;
      this._ignorePop = true;
      history.back();
    }
    const cur = this.cur;
    const node = this.g.reveal(this.i);
    if (node && cur.fit && !reduced()) {
      const fromT = getComputedStyle(cur.img).transform;
      const to = this._flip(node.getBoundingClientRect(), cur.fit);
      const bgFrom = getComputedStyle(this.bg).opacity;
      const a = cur.img.animate(
        [{ transform: fromT === "none" ? "none" : fromT }, { transform: to }],
        { duration: 260, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" }
      );
      this.bg.animate([{ opacity: bgFrom }, { opacity: 0 }], { duration: 240, fill: "forwards" });
      this.d.querySelectorAll(".ff-lb__ui").forEach((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: "forwards" }));
      try {
        await a.finished;
      } catch {
      }
    }
    if (this.d.open) this.d.close();
    else this._finish();
  }
  _finish() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.closing = false;
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("popstate", this._onPop);
    if (this._pushed) {
      this._pushed = false;
      this._ignorePop = true;
      history.back();
    }
    this.d.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    this.bg.style.opacity = "";
    this.slides.forEach((s) => {
      s.tok = ++this.seq;
      s.img.removeAttribute("src");
      s.img.style.transform = "";
    });
    this.pointers.clear();
    const f = this.g.nodes.get(this.i) || this.returnFocus;
    if (f && f.isConnected) f.focus({ preventScroll: true });
    this.g._emit("close", { index: this.i });
  }
  destroy() {
    if (this.isOpen) {
      this.closing = true;
      if (this.d.open) this.d.close();
      this._finish();
    }
    if (this.d) this.d.remove();
    this.d = null;
  }
  // ---- navigation --------------------------------------------------------
  go(delta, fromDx = 0) {
    const n = this.g.items.length;
    const ni = this.i + delta;
    if (this.animating) return;
    if (ni < 0 || ni >= n) {
      this._snapTrack(fromDx);
      if (ni >= n) this.g.loadMore();
      return;
    }
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
      this.g._emit("change", { index: ni, item: this.g.items[ni].data });
    };
    if (reduced()) {
      done();
      return;
    }
    const anim = this.track.animate(
      [{ transform: `translateX(${fromDx}px)` }, { transform: `translateX(${-delta * (vw + GAP)}px)` }],
      { duration: fromDx ? 220 : 300, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" }
    );
    anim.finished.then(() => {
      anim.cancel();
      done();
    }, () => {
      this.animating = false;
    });
  }
  _snapTrack(fromDx) {
    if (!fromDx) {
      this.track.style.transform = "";
      return;
    }
    const a = this.track.animate(
      [{ transform: `translateX(${fromDx}px)` }, { transform: "translateX(0)" }],
      { duration: 220, easing: "ease-out" }
    );
    this.track.style.transform = "";
    return a;
  }
  _key(e) {
    if (e.target && e.target.closest && e.target.closest("button") && (e.key === "Enter" || e.key === " ")) return;
    const vw = this._vw(), vh = this._vh();
    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
        this.go(1);
        break;
      case "ArrowLeft":
      case "PageUp":
        this.go(-1);
        break;
      case "Home":
        this.jump(0);
        break;
      case "End":
        this.jump(this.g.items.length - 1);
        break;
      case "+":
      case "=":
        this.zoomTo(this.z * 1.6, vw / 2, vh / 2, true);
        break;
      case "-":
      case "_":
        this.zoomTo(this.z / 1.6, vw / 2, vh / 2, true);
        break;
      case "0":
        this.zoomTo(1, vw / 2, vh / 2, true);
        break;
      default:
        return;
    }
    e.preventDefault();
  }
  // ---- zoom --------------------------------------------------------------
  _resetZoom() {
    this.z = 1;
    this.px = 0;
    this.py = 0;
    if (this.d) this.d.classList.remove("is-zoomed");
    const s = this.cur;
    if (s) s.img.style.transform = "";
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
    if (this.z <= 1.001) {
      this.px = 0;
      this.py = 0;
      return;
    }
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
    img.style.transition = animate && !reduced() ? "transform .25s cubic-bezier(.2,.8,.2,1)" : "";
    img.style.transform = this.z === 1 && !this.px && !this.py ? "" : `translate(${this.px}px,${this.py}px) scale(${this.z})`;
    this.d.classList.toggle("is-zoomed", this.z > 1.01);
    if (animate) setTimeout(() => {
      img.style.transition = "";
    }, 260);
  }
  /** Zoom so that viewport point (cx, cy) stays under the pointer. */
  zoomTo(z, cx, cy, animate) {
    const s = this.cur;
    if (!s || !s.fit || s.index < 0) return;
    z = clamp(z, 1, MAX_ZOOM);
    const ox = s.fit.x + s.fit.w / 2, oy = s.fit.y + s.fit.h / 2;
    const k = z / this.z;
    this.px = cx - ox - (cx - ox - this.px) * k;
    this.py = cy - oy - (cy - oy - this.py) * k;
    this.z = z;
    if (z === 1) {
      this.px = 0;
      this.py = 0;
    }
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
    if (e.ctrlKey) {
      this.zoomTo(this.z * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY, false);
      return;
    }
    if (this.z > 1.01) {
      this.px -= e.deltaX;
      this.py -= e.deltaY;
      this._clampPan(false);
      this._applyZoom(false);
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
    if (e.target.closest && e.target.closest(".ff-lb__btn")) return;
    try {
      this.stage.setPointerCapture(e.pointerId);
    } catch {
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.gest = { x: e.clientX, y: e.clientY, t: now(), px: this.px, py: this.py, mode: null, moved: false };
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.track.style.transform = "";
      this.cur.img.style.transform = this.z === 1 ? "" : this.cur.img.style.transform;
      this.pinch = {
        d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
        z0: this.z,
        px0: this.px,
        py0: this.py
      };
      if (this.gest) {
        this.gest.mode = "pinch";
        this.gest.moved = true;
      }
    }
  }
  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
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
      g.mode = this.z > 1.01 ? "pan" : Math.abs(dx) > Math.abs(dy) ? "swipe" : "dismiss";
    }
    if (g.mode === "pan") {
      this.px = g.px + dx;
      this.py = g.py + dy;
      this._clampPan(true);
      this._applyZoom(false);
    } else if (g.mode === "swipe") {
      const blocked = dx > 0 && this.i <= 0 || dx < 0 && this.i >= this.g.items.length - 1;
      g.dx = blocked ? dx * 0.3 : dx;
      this.track.style.transform = `translateX(${g.dx}px)`;
    } else if (g.mode === "dismiss") {
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
        else {
          this._clampPan(false);
          this._applyZoom(true);
          this._upgrade();
        }
        const rest = [...this.pointers.values()][0];
        this.gest = rest ? { x: rest.x, y: rest.y, t: now(), px: this.px, py: this.py, mode: "pan", moved: true } : null;
      }
      return;
    }
    if (this.pointers.size || !g) return;
    this.gest = null;
    const dt = Math.max(1, now() - g.t);
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.moved) {
      if (!cancelled) this._tap(e);
      return;
    }
    if (g.mode === "pan") {
      this._clampPan(false);
      this._applyZoom(true);
      return;
    }
    if (g.mode === "swipe") {
      const vw = this._vw(), v = dx / dt;
      const sdx = g.dx || 0;
      if (!cancelled && (dx < -vw * 0.18 || v < -0.45) && this.i < this.g.items.length - 1) this.go(1, sdx);
      else if (!cancelled && (dx > vw * 0.18 || v > 0.45) && this.i > 0) this.go(-1, sdx);
      else this._snapTrack(sdx);
      return;
    }
    if (g.mode === "dismiss") {
      if (!cancelled && (Math.abs(dy) > this._vh() * 0.14 || Math.abs(dy / dt) > 0.6)) {
        this.close();
        return;
      }
      const img = this.cur.img, from = img.style.transform;
      img.style.transform = "";
      img.animate([{ transform: from }, { transform: "none" }], { duration: 200, easing: "ease-out" });
      const op = this.bg.style.opacity || "1";
      this.bg.style.opacity = "";
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
      if (onImage || this.z > 1.01) this.d.classList.toggle("is-chromeless");
      else this.close();
    }, 260);
  }
};

// src/frameflow.js
var VERSION = "1.0.0";
var DEFAULTS = {
  layout: "justified",
  // 'justified' | 'masonry' | 'grid'
  rowHeight: 220,
  // justified: target row height in px
  columnWidth: 240,
  // masonry / grid: minimum column width in px
  gap: 6,
  // space between tiles in px
  height: null,
  // e.g. '70vh' to scroll inside a frame; null scrolls with the page
  src: null,
  // JSON URL, may contain {page}
  source: null,
  // async ({page, cursor, signal}) => items | {items, next}
  items: null,
  // initial items
  imageUrl: null,
  // (item, widthPx, kind) => url | Promise<url>, for image CDNs
  lightbox: true,
  history: true,
  // back button closes the viewer
  captions: true,
  measure: true,
  // load images to find their size when w/h are missing
  preload: 1.5,
  // start loading the next page this many screens early
  buffer: 1,
  // keep tiles this many screens above/below the view
  credentials: "same-origin",
  cursorParam: "cursor",
  // JSON sources: query parameter for cursor tokens
  injectStyles: true,
  nonce: null,
  text: {}
};
var TEXT = {
  label: "Photo gallery",
  viewer: "Photo viewer",
  open: "Open photo {n} of {total}",
  close: "Close",
  prev: "Previous photo",
  next: "Next photo",
  loading: "Loading photos",
  end: "",
  empty: "No photos to show yet.",
  error: "Couldn't load more photos.",
  retry: "Try again"
};
var WIDTH_STEPS = [160, 240, 320, 480, 640, 800, 1024, 1280, 1600, 1920, 2560, 3200, 3840];
var stepUp = (w) => WIDTH_STEPS.find((s) => s >= w) || WIDTH_STEPS[WIDTH_STEPS.length - 1];
var thenable2 = (v) => v && typeof v.then === "function";
var raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
function readDataset(el) {
  const d = el.dataset, o = {};
  const n = (k) => d[k] != null && d[k] !== "" && Number.isFinite(+d[k]) ? +d[k] : void 0;
  if (d.src) o.src = d.src;
  if (d.layout) o.layout = d.layout;
  if (d.height) o.height = d.height;
  if (n("rowHeight") != null) o.rowHeight = n("rowHeight");
  if (n("columnWidth") != null) o.columnWidth = n("columnWidth");
  if (n("gap") != null) o.gap = n("gap");
  for (const k of ["lightbox", "history", "captions", "measure"]) {
    if (d[k] != null) o[k] = d[k] !== "false";
  }
  return o;
}
function harvest(el) {
  const out = [];
  el.querySelectorAll("img").forEach((img) => {
    const a = img.closest("a");
    out.push({
      src: a && a.getAttribute("href") || img.getAttribute("data-full") || img.getAttribute("src"),
      thumb: img.getAttribute("src"),
      srcset: img.getAttribute("srcset") || void 0,
      w: img.getAttribute("data-w") || img.getAttribute("width"),
      h: img.getAttribute("data-h") || img.getAttribute("height"),
      alt: img.getAttribute("alt"),
      caption: a && a.getAttribute("data-caption") || img.getAttribute("data-caption") || img.getAttribute("title")
    });
  });
  return out;
}
function measure(url, ms = 1e4) {
  return new Promise((res) => {
    if (!url) return res(null);
    const img = new Image();
    const t = setTimeout(() => res(null), ms);
    img.onload = () => {
      clearTimeout(t);
      res(img.naturalWidth ? [img.naturalWidth, img.naturalHeight] : null);
    };
    img.onerror = () => {
      clearTimeout(t);
      res(null);
    };
    img.src = url;
  });
}
var Frameflow = class {
  /**
   * @param {Element|string} el  container element or selector
   * @param {object} [options]   see DEFAULTS above
   */
  constructor(el, options = {}) {
    if (typeof el === "string") el = document.querySelector(el);
    if (!el || el.nodeType !== 1) throw new Error("Frameflow: container element not found");
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
    this.nodes = /* @__PURE__ */ new Map();
    this.pool = [];
    this.done = false;
    this.loading = false;
    this.error = null;
    this.empties = 0;
    this._abort = typeof AbortController === "function" ? new AbortController() : null;
    if (o.injectStyles) injectStyles(o.nonce);
    const initial = harvest(el);
    this._build();
    this.source = createSource(o);
    if (!this.source) this.done = true;
    this.lightbox = o.lightbox ? new Lightbox(this) : null;
    this._bind();
    const first = [...initial, ...Array.isArray(o.items) ? o.items : []];
    this._status();
    if (first.length) this.append(first);
    else this._schedule();
  }
  // ---- public API --------------------------------------------------------
  /** Adds items to the end. Accepts URL strings or item objects. */
  async append(list) {
    const allow = typeof this.o.imageUrl === "function";
    const items = (Array.isArray(list) ? list : [list]).map((r) => normalizeItem(r, allow)).filter(Boolean);
    if (this.o.measure) {
      await Promise.all(items.map(async (it) => {
        if (it.w > 0 && it.h > 0) return;
        const d = await measure(this._sync(this._thumbFor(it, 320)) || it.thumb || it.src);
        if (d) {
          it.w = d[0];
          it.h = d[1];
        }
      }));
    }
    if (this.destroyed || !items.length) {
      this._status();
      return items.length;
    }
    const start = this.items.length;
    this.items.push(...items);
    this._layout();
    this._render();
    this._status();
    if (this.lightbox) this.lightbox.refresh();
    this._emit("load", { start, count: items.length, total: this.items.length });
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
        this._emit("end", { total: this.items.length });
      }
    } catch (err) {
      if (this.destroyed || err && err.name === "AbortError") return;
      this.error = err;
      this._emit("error", { error: err });
      if (typeof console !== "undefined") console.warn(err);
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
  retry() {
    this.error = null;
    this._status();
    this.loadMore();
  }
  open(index) {
    if (this.lightbox) this.lightbox.open(index);
  }
  close() {
    if (this.lightbox) this.lightbox.close();
  }
  /** Re-measures and re-lays out, e.g. after changing options. */
  refresh() {
    this._layout(true);
    this._render();
  }
  /** Changes layout options at runtime: { layout, rowHeight, columnWidth, gap }. */
  set(opts) {
    for (const k of ["layout", "rowHeight", "columnWidth", "gap"]) if (k in opts) this.o[k] = opts[k];
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
    this.el.classList.remove("ff", "ff--frame");
    if (this.frame) this.el.style.height = "";
    delete this.el.__frameflow;
  }
  // ---- image URLs --------------------------------------------------------
  _sync(v) {
    return thenable2(v) ? null : v;
  }
  _thumbFor(item, cssWidth) {
    const dpr = Math.min(typeof devicePixelRatio === "number" && devicePixelRatio || 1, 3);
    const need = stepUp(Math.ceil(cssWidth * dpr));
    if (this.o.imageUrl) {
      const r = this.o.imageUrl(item.data, need, "thumb");
      return thenable2(r) ? r.then(safeUrl) : safeUrl(r);
    }
    return pickCandidate(item.srcset, need) || item.thumb || item.src;
  }
  _fullFor(item, px) {
    const need = stepUp(Math.min(px, item.w || Infinity));
    if (this.o.imageUrl) {
      const r = this.o.imageUrl(item.data, need, "full");
      return thenable2(r) ? r.then(safeUrl) : safeUrl(r);
    }
    if (item.src && item.src !== item.thumb) return item.src;
    return pickCandidate(item.srcset, need) || item.src;
  }
  // ---- DOM ---------------------------------------------------------------
  _build() {
    const el = this.el, o = this.o;
    el.replaceChildren();
    el.classList.add("ff");
    if (!el.hasAttribute("role")) el.setAttribute("role", "region");
    if (!el.hasAttribute("aria-label")) el.setAttribute("aria-label", o.text.label);
    this.frame = !!o.height;
    if (this.frame) {
      el.classList.add("ff--frame");
      el.style.height = typeof o.height === "number" ? o.height + "px" : String(o.height);
      if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
    }
    this.canvas = document.createElement("div");
    this.canvas.className = "ff__canvas";
    this.statusEl = document.createElement("div");
    this.statusEl.className = "ff__status";
    this.statusEl.setAttribute("role", "status");
    el.append(this.canvas, this.statusEl);
  }
  _tile() {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ff__tile";
    const img = document.createElement("img");
    img.alt = "";
    img.decoding = "async";
    img.draggable = false;
    img.onload = () => {
      img.classList.add("is-loaded");
      b.classList.remove("is-error");
    };
    img.onerror = () => {
      if (img.getAttribute("src")) b.classList.add("is-error");
    };
    b.appendChild(img);
    return b;
  }
  _mount(i) {
    const node = this.pool.pop() || this._tile();
    const item = this.items[i];
    const img = node.firstChild;
    node.dataset.i = String(i);
    this._position(node, this.boxes[i]);
    node.style.backgroundColor = item.color || "";
    node.style.backgroundImage = item.lqip ? `url("${item.lqip}")` : "";
    node.classList.remove("is-error");
    node.setAttribute("aria-label", (item.alt ? item.alt + ". " : "") + this.o.text.open.replace("{n}", i + 1).replace("{total}", this.items.length + (this.done ? "" : "+")));
    img.classList.remove("is-loaded");
    img.removeAttribute("src");
    const tok = node._tok = (node._tok || 0) + 1;
    const url = this._thumbFor(item, this.boxes[i].w);
    const set = (u) => {
      if (node._tok === tok && u) {
        img.src = u;
        if (img.complete && img.naturalWidth) img.classList.add("is-loaded");
      }
    };
    if (thenable2(url)) url.then(set, () => node.classList.add("is-error"));
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
    s.width = b.w + "px";
    s.height = b.h + "px";
  }
  _status() {
    const s = this.statusEl, t = this.o.text;
    if (!s) return;
    s.replaceChildren();
    if (this.error) {
      const msg = document.createElement("span");
      msg.textContent = t.error;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ff__retry";
      btn.textContent = t.retry;
      btn.addEventListener("click", () => this.retry());
      s.append(msg, btn);
    } else if (this.loading) {
      const sp = document.createElement("span");
      sp.className = "ff__spin";
      sp.setAttribute("aria-hidden", "true");
      const msg = document.createElement("span");
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
    this.canvas.style.height = r.height + "px";
    const order = this.boxes.map((_, i) => i);
    if (o.layout === "masonry") order.sort((a, b) => this.boxes[a].y - this.boxes[b].y);
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
      const mid = lo + hi >> 1;
      if (boxes[order[mid]].y < y) lo = mid + 1;
      else hi = mid;
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
    raf(() => {
      this._pending = false;
      if (!this.destroyed) this._render();
    });
  }
  _render() {
    const v = this._view();
    const screen = Math.max(v.h, 300);
    const want = /* @__PURE__ */ new Set();
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
    scroller.addEventListener("scroll", onScroll, { passive: true });
    if (this.frame) window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    if (typeof ResizeObserver === "function") {
      this._ro = new ResizeObserver(() => {
        const w = this.canvas.clientWidth;
        if (w && w !== this.width) {
          this._layout(true);
          this._render();
        }
      });
      this._ro.observe(this.canvas);
    }
    const onClick = (e) => {
      const tile = e.target.closest && e.target.closest(".ff__tile");
      if (!tile || !this.el.contains(tile)) return;
      const i = +tile.dataset.i;
      this._emit("click", { index: i, item: this.items[i] && this.items[i].data });
      if (this.lightbox) this.lightbox.open(i);
    };
    const onKey = (e) => this._key(e);
    this.el.addEventListener("click", onClick);
    this.el.addEventListener("keydown", onKey);
    this._unbind = () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      this.el.removeEventListener("click", onClick);
      this.el.removeEventListener("keydown", onKey);
    };
  }
  /** Arrow keys move focus between tiles, rendering them as needed. */
  _key(e) {
    const tile = e.target.closest && e.target.closest(".ff__tile");
    if (!tile) return;
    const i = +tile.dataset.i, b = this.boxes[i], n = this.items.length;
    let t = null;
    if (e.key === "ArrowRight") t = Math.min(n - 1, i + 1);
    else if (e.key === "ArrowLeft") t = Math.max(0, i - 1);
    else if (e.key === "Home") t = 0;
    else if (e.key === "End") t = n - 1;
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const down = e.key === "ArrowDown", cx = b.x + b.w / 2;
      let best = null, bestScore = Infinity;
      for (let k = Math.max(0, i - 200); k < Math.min(n, i + 200); k++) {
        const c = this.boxes[k];
        const dy = down ? c.y - (b.y + b.h) : b.y - (c.y + c.h);
        if (dy < -1) continue;
        const score = dy * 4 + Math.abs(c.x + c.w / 2 - cx);
        if (score < bestScore) {
          bestScore = score;
          best = k;
        }
      }
      t = best;
    } else return;
    e.preventDefault();
    if (t == null || t === i) return;
    const node = this.reveal(t);
    if (node) node.focus({ preventScroll: true });
  }
  _emit(name, detail) {
    this.el.dispatchEvent(new CustomEvent("frameflow:" + name, { detail }));
  }
};
function autoInit(root = document) {
  return [...root.querySelectorAll("[data-frameflow]")].filter((el) => !el.__frameflow).map((el) => new Frameflow(el));
}
Frameflow.autoInit = autoInit;
Frameflow.version = VERSION;
var frameflow_default = Frameflow;
export {
  Frameflow,
  VERSION,
  autoInit,
  frameflow_default as default
};
