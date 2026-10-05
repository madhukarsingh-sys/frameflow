// Turns whatever the data source returns into a clean, validated item.
// Everything here treats input as untrusted: URLs are checked against an
// allow-list of protocols and text is only ever rendered with textContent.

const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i;
const ALLOWED = new Set(['http:', 'https:', 'blob:']);

function base() {
  return (typeof document !== 'undefined' && document.baseURI) ||
    (typeof location !== 'undefined' && location.href) || 'http://localhost/';
}

/** Returns the URL if it is safe to use as an image source, otherwise null. */
export function safeUrl(u) {
  if (typeof u !== 'string') return null;
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

/** Like safeUrl but for JSON endpoints: http(s) only, resolved absolutely. */
export function safeFetchUrl(u, relativeTo) {
  if (typeof u !== 'string' || !u.trim()) return null;
  try {
    const url = new URL(u.trim(), relativeTo || base());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function text(v, max) {
  if (v == null) return '';
  return String(v).replace(/\s+/g, ' ').trim().slice(0, max);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 1e6 ? n : 0;
}

function color(v) {
  if (typeof v !== 'string' || v.length > 64) return '';
  const c = v.trim();
  if (typeof CSS !== 'undefined' && CSS.supports) return CSS.supports('color', c) ? c : '';
  return /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/+-]+\))$/i.test(c) ? c : '';
}

/** Accepts "a.jpg 400w, b.jpg 800w" or [{src|url, w|width}]. */
export function parseSrcset(v) {
  let list = [];
  if (Array.isArray(v)) {
    list = v.map(c => c && ({ url: safeUrl(c.src || c.url), w: num(c.w || c.width) }));
  } else if (typeof v === 'string') {
    list = v.split(/,\s+/).map(part => {
      const m = part.trim().match(/^(\S+)\s+(\d+)w$/);
      return m && { url: safeUrl(m[1]), w: num(m[2]) };
    });
  }
  return list.filter(c => c && c.url && c.w).sort((a, b) => a.w - b.w);
}

/** Picks the smallest candidate that is at least `need` px wide. */
export function pickCandidate(candidates, need) {
  if (!candidates.length) return null;
  for (const c of candidates) if (c.w >= need) return c.url;
  return candidates[candidates.length - 1].url;
}

/**
 * Normalizes a raw item. Accepts a URL string or an object such as
 * { src, thumb, srcset, w, h, alt, caption, color, lqip, id }.
 * Returns null when there is no usable image URL (unless allowNoUrl is set,
 * which is the case when an imageUrl() resolver builds URLs from the item).
 */
export function normalizeItem(raw, allowNoUrl = false) {
  if (typeof raw === 'string') raw = { src: raw };
  if (!raw || typeof raw !== 'object') return null;
  const src = safeUrl(raw.src || raw.url || raw.full);
  const thumb = safeUrl(raw.thumb || raw.thumbnail);
  const srcset = parseSrcset(raw.srcset);
  if (!src && !thumb && !srcset.length && !allowNoUrl) return null;
  const lqip = typeof raw.lqip === 'string' && DATA_IMAGE.test(raw.lqip) &&
    !/["'\\\s)]/.test(raw.lqip) ? raw.lqip : '';
  return {
    src: src || thumb || (srcset.length ? srcset[srcset.length - 1].url : ''),
    thumb,
    srcset,
    w: num(raw.w || raw.width),
    h: num(raw.h || raw.height),
    alt: text(raw.alt, 500),
    caption: text(raw.caption != null ? raw.caption : raw.title, 2000),
    color: color(raw.color),
    lqip,
    id: raw.id != null ? text(raw.id, 200) : '',
    data: raw,
  };
}
