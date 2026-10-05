import { safeFetchUrl } from './items.js';

// A source is an object with `next(signal)` that resolves to
// { items: Array, done: boolean, total: number|null }, plus `state()` which
// returns where it is, so paging can resume after a reload. Two kinds:
//
// 1. A JSON URL. Use "{page}" in it for numbered pages, for example
//    "/api/photos?page={page}". The response can be a plain array, or an
//    object like { items: [...], next: "/api/photos?cursor=abc" } (a URL,
//    relative to the current one) or { items: [...], cursor: "abc" } (a token
//    sent back as ?cursor=abc). An optional `total` is passed through.
// 2. A function ({ page, cursor, signal, ...query }) => array | { items, next }.
//    Use this for Firebase, Supabase, a CMS, or anything else.
//
// `query` (an object such as { sort: 'price', category: 'mugs' }) is added to
// JSON URLs as query parameters and spread into the function's argument.
// `init` ({ page, cursor, nextUrl }) starts the source part-way through.

const MAX_EMPTY_PAGES = 3;

function pickItems(r) {
  if (Array.isArray(r)) return r;
  if (r && typeof r === 'object') {
    for (const k of ['items', 'products', 'photos', 'images', 'data', 'results']) {
      if (Array.isArray(r[k])) return r[k];
    }
  }
  return [];
}

function pickTotal(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  for (const k of ['total', 'totalCount', 'count']) {
    const n = Number(r[k]);
    if (r[k] != null && Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

// `next` / `nextUrl` hold a URL; `nextPageToken` / `cursor` hold an opaque
// token that is sent back as ?cursor=<token> (or the cursorParam option).
function pickNext(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { has: false, value: null, url: false };
  for (const k of ['next', 'nextUrl']) if (k in r) return { has: true, value: r[k] || null, url: true };
  for (const k of ['nextPageToken', 'cursor']) if (k in r) return { has: true, value: r[k] || null, url: false };
  return { has: false, value: null, url: false };
}

function startPage(init) {
  const p = Math.floor(Number(init && init.page));
  return Number.isFinite(p) && p >= 1 ? p : 1;
}

export function createSource(o, init = {}) {
  const query = o.query && typeof o.query === 'object' ? o.query : {};
  if (typeof o.source === 'function') return functionSource(o.source, query, init);
  if (typeof o.src === 'string' && o.src.trim()) return jsonSource(o.src.trim(), o, query, init);
  return null;
}

function functionSource(fn, query, init) {
  let page = startPage(init);
  let cursor = init.cursor != null ? init.cursor : null;
  let empties = 0;
  return {
    state: () => ({ page, cursor }),
    async next(signal) {
      const r = await fn(Object.assign({}, query, { page, cursor, signal }));
      page++;
      const items = pickItems(r);
      const nx = pickNext(r);
      if (nx.has) cursor = nx.value;
      empties = items.length ? 0 : empties + 1;
      const done = (r && r.done === true) || (nx.has && !nx.value) ||
        (!items.length && (!nx.has || empties >= MAX_EMPTY_PAGES));
      return { items, done, total: pickTotal(r) };
    },
  };
}

function withQuery(href, query, reserved) {
  const u = new URL(href);
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === '' || v === false || reserved.includes(k)) continue;
    u.searchParams.set(k, String(v));
  }
  return u.href;
}

function jsonSource(template, o, query, init) {
  const paged = template.includes('{page}');
  let page = startPage(init);
  let nextUrl = init.nextUrl ? safeFetchUrl(init.nextUrl) : null;
  let empties = 0;

  return {
    state: () => ({ page, nextUrl }),
    async next(signal) {
      let url;
      if (nextUrl) {
        url = nextUrl; // links from the server already carry their own state
      } else {
        const first = safeFetchUrl(template.split('{page}').join(String(page)));
        url = first && withQuery(first, query, ['page', o.cursorParam || 'cursor']);
      }
      if (!url) throw new Error('Frameflow: refusing to fetch an invalid or non-http(s) URL');
      const res = await fetch(url, {
        signal,
        credentials: o.credentials || 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`Frameflow: ${url} answered HTTP ${res.status}`);
      const r = await res.json();
      page++;
      const items = pickItems(r);
      const nx = pickNext(r);
      nextUrl = null;
      if (nx.has && nx.value) {
        const v = String(nx.value);
        nextUrl = nx.url ? safeFetchUrl(v, url) : withParam(url, o.cursorParam || 'cursor', v);
      }
      empties = items.length ? 0 : empties + 1;
      let done;
      if (nx.has) done = !nextUrl;
      else if (paged) done = !items.length || empties >= MAX_EMPTY_PAGES;
      else done = true; // a single JSON file holds the whole album
      if (r && r.done === true) done = true;
      return { items, done, total: pickTotal(r) };
    },
  };
}

function withParam(href, key, value) {
  const u = new URL(href);
  u.searchParams.set(key, value);
  return u.href;
}
