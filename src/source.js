import { safeFetchUrl } from './items.js';

// A source is an object with `next(signal)` that resolves to
// { items: Array, done: boolean }. Two kinds are built in:
//
// 1. A JSON URL. Use "{page}" in it for numbered pages, for example
//    "/api/photos?page={page}". The response can be a plain array, or an
//    object like { items: [...], next: "/api/photos?cursor=abc" }.
// 2. A function ({ page, cursor, signal }) => array | { items, next }.
//    Use this for Firebase, Supabase, a CMS, or anything else.

const MAX_EMPTY_PAGES = 3;

function pickItems(r) {
  if (Array.isArray(r)) return r;
  if (r && typeof r === 'object') {
    for (const k of ['items', 'photos', 'images', 'data', 'results']) {
      if (Array.isArray(r[k])) return r[k];
    }
  }
  return [];
}

function pickNext(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { has: false, value: null };
  for (const k of ['next', 'nextUrl', 'nextPageToken', 'cursor']) {
    if (k in r) return { has: true, value: r[k] || null };
  }
  return { has: false, value: null };
}

export function createSource(o) {
  if (typeof o.source === 'function') return functionSource(o.source);
  if (typeof o.src === 'string' && o.src.trim()) return jsonSource(o.src.trim(), o);
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
      const done = (r && r.done === true) || (nx.has && !nx.value) ||
        (!items.length && (!nx.has || empties >= MAX_EMPTY_PAGES));
      return { items, done };
    },
  };
}

function jsonSource(template, o) {
  const paged = template.includes('{page}');
  let page = 1;
  let nextUrl = null;
  let empties = 0;

  return {
    async next(signal) {
      const raw = nextUrl || template.split('{page}').join(String(page));
      const url = safeFetchUrl(raw);
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
        // A "next" value may be a URL or an opaque cursor token.
        // Anything with a scheme, a path or a query is a URL and must pass the
        // http(s) check; everything else is sent back as ?cursor=<token>.
        const v = String(nx.value);
        const asUrl = /^[a-z][a-z0-9+.-]*:/i.test(v) || /^\.{0,2}\//.test(v) || v.includes('?');
        nextUrl = asUrl ? safeFetchUrl(v, url) : withParam(url, 'cursor', v);
      }
      empties = items.length ? 0 : empties + 1;
      let done;
      if (nx.has) done = !nextUrl;
      else if (paged) done = !items.length || empties >= MAX_EMPTY_PAGES;
      else done = true; // a single JSON file holds the whole album
      if (r && r.done === true) done = true;
      return { items, done };
    },
  };
}

function withParam(href, key, value) {
  const u = new URL(href);
  u.searchParams.set(key, value);
  return u.href;
}
