# Frameflow

A drop-in photo gallery that keeps loading as you scroll. Add one script tag and one `<div>`, point it at your photos, and you get:

- **Three layouts**: justified rows (like Google Photos), masonry (like Pinterest), or a square grid.
- **Infinite loading** from a JSON URL, any async function (Firebase, Supabase, a CMS), or plain `<img>` tags already in the page.
- **Virtualized rendering.** Only the tiles near the screen exist in the DOM. A 5,000-photo album keeps roughly the same number of elements as a 50-photo one, so scrolling stays smooth on phones.
- **No layout jumps.** Space for each photo is reserved before it loads, with a placeholder color or blurred preview.
- **Right-sized images.** Each tile asks for an image as wide as it is actually drawn, via `srcset` or your image CDN.
- **A full-screen viewer**:
  - On touch screens: swipe between photos, pinch or double-tap to zoom, pan, and swipe down to close.
  - On desktop: arrow keys, trackpad swipes, and pinch or Ctrl + scroll to zoom.
  - The phone's back button closes the viewer instead of leaving the page.
- **Accessible.**
  - Tiles are real buttons with labels.
  - Arrow keys move between photos, including ones not yet rendered.
  - Focus returns to the photo after the viewer closes.
  - Reduced-motion settings are respected.
- **Safe with untrusted data.** URLs are checked against a protocol allow-list, and captions are always rendered as text, never HTML.
- **Zero dependencies**, about 12 KB gzipped, MIT licensed.

**Demo:** open `docs/index.html` in a browser. It works offline because its photos are painted on a canvas.

## Install

The quickest way is a script tag:

```html
<script src="https://cdn.jsdelivr.net/gh/madhukarsingh-sys/frameflow@v1.0.0/dist/frameflow.min.js"></script>
```

```bash
npm install frameflow
```

```js
import Frameflow from 'frameflow';
```

## Use

### 1. From a JSON endpoint

```html
<div data-frameflow data-src="/api/photos?page={page}" data-height="70vh"></div>
<script src="frameflow.min.js"></script>
```

`{page}` is replaced with 1, 2, 3… and loading stops at the first empty page. Instead of numbered pages, the response can say where to go next:

```json
{
  "items": [
    { "src": "/p/lake.jpg", "w": 3000, "h": 2000, "alt": "Lake at dawn" }
  ],
  "next": "/api/photos?after=8f2a"
}
```

- `next` (or `nextUrl`) is a URL, relative to the current one.
- `cursor` (or `nextPageToken`) is an opaque token. Frameflow sends it back as `?cursor=<token>`; set the `cursorParam` option to change the parameter name.
- `null` in any of these ends the album.
- A plain array is also accepted.
- A URL without `{page}` and without a `next` field is treated as the whole album in one file.

### 2. From a function (Firebase, Supabase, any API)

```js
new Frameflow('#album', {
  height: '70vh',
  source: async ({ page, cursor, signal }) => {
    const res = await fetch(`/api/photos?cursor=${cursor ?? ''}`, { signal });
    const body = await res.json();
    return { items: body.photos, next: body.nextCursor }; // next: null ends it
  },
});
```

The function can return a plain array (an empty array ends the album) or `{ items, next }`. Whatever you return as `next`, `cursor` or `nextPageToken` is passed back to you as `cursor` on the following call. See `examples/firebase-storage.html` for a complete Firebase Storage version.

### 3. From plain HTML

```html
<div data-frameflow data-layout="masonry">
  <a href="big/1.jpg" data-caption="Harbour at noon">
    <img src="small/1.jpg" width="600" height="400" alt="Harbour">
  </a>
  <img src="small/2.jpg" width="400" height="600" alt="Lighthouse">
</div>
```

Images already in the container become the first photos, so the album still shows if the script fails. `<a href>` is used as the full-size image. You can combine this with `data-src` to load more after them.

## Photo fields

Each photo is a URL string or an object:

| Field | Meaning |
|---|---|
| `src` | Full-size image. `url` and `full` also work. |
| `thumb` | Smaller image for the grid. `thumbnail` also works. |
| `srcset` | `"a.jpg 400w, b.jpg 800w"` or `[{ src, w }]`. The grid picks the smallest image that is wide enough. |
| `w`, `h` | Original pixel size. Strongly recommended: without it each image is downloaded once to measure it before it can be placed. |
| `alt` | Description for screen readers. |
| `caption` | Shown in the viewer. `title` also works. |
| `color` | Placeholder color shown while loading, e.g. the photo's average color. |
| `lqip` | A tiny `data:image/...` preview shown while loading. |
| `id` | Your own identifier, passed back in events. |

Any other fields are kept and passed back to you in events and in `imageUrl()`.

## Options

Options can be set as `data-*` attributes (`data-row-height="200"`) or in JavaScript.

| Option | Default | Meaning |
|---|---|---|
| `layout` | `'justified'` | `'justified'`, `'masonry'` or `'grid'`. |
| `rowHeight` | `220` | Target row height for justified rows. Reduced automatically on narrow screens. |
| `columnWidth` | `240` | Minimum column width for masonry and grid. Phones get at least two columns. |
| `gap` | `6` | Space between photos, in px. |
| `height` | `null` | Set (e.g. `'70vh'` or `600`) to scroll inside a frame. Leave empty to scroll with the page. |
| `src` | `null` | JSON URL, optionally with `{page}`. |
| `source` | `null` | Async function returning photos, as above. |
| `items` | `null` | Photos to show immediately. |
| `imageUrl` | `null` | `(item, width, kind) => url` to build URLs for an image CDN. `kind` is `'thumb'` or `'full'`, and `width` is the exact pixel width needed (already multiplied by screen density). May return a Promise. |
| `lightbox` | `true` | Open the viewer on click. |
| `history` | `true` | The back button closes the viewer. |
| `captions` | `true` | Show captions in the viewer. |
| `measure` | `true` | Measure photos that have no `w`/`h`. |
| `preload` | `1.5` | Start loading the next page this many screen-heights before the end. |
| `buffer` | `1` | Keep tiles this many screen-heights above and below the view. |
| `credentials` | `'same-origin'` | `fetch()` credentials mode for JSON sources. |
| `cursorParam` | `'cursor'` | Query parameter used to send cursor tokens back. |
| `injectStyles` | `true` | Set to `false` and link `dist/frameflow.css` yourself under a strict CSP. |
| `nonce` | `null` | CSP nonce for the injected `<style>`. |
| `text` | | Override any interface text, for translation: `{ loading, end, empty, error, retry, close, prev, next, open, label, viewer }`. In `open`, `{n}` and `{total}` are replaced with numbers. |

Example for an image CDN such as Cloudinary or imgix:

```js
new Frameflow('#album', {
  src: '/api/photos?page={page}',
  imageUrl: (item, width) => `https://cdn.example.com/${item.id}?w=${width}&auto=format`,
});
```

## API

```js
const g = new Frameflow('#album', options); // or the element itself

g.append([{ src, w, h }]);  // add photos yourself
g.loadMore();               // load the next page now
g.retry();                  // retry after an error
g.open(5); g.close();       // control the viewer
g.set({ layout: 'grid' });  // change layout, rowHeight, columnWidth or gap
g.reveal(120);              // scroll photo 120 into view
g.refresh();                // re-measure, e.g. after the container was hidden
g.destroy();                // remove everything and all listeners

g.items;  // loaded photos (normalized; your original object is item.data)
g.done;   // true when the album has ended

Frameflow.autoInit();       // set up [data-frameflow] elements added later (SPAs)
```

Add `data-manual` to the script tag to stop the automatic setup on page load.

### Events

All events fire on the gallery element, with details in `event.detail`:

| Event | Detail |
|---|---|
| `frameflow:load` | `{ start, count, total }` after photos are added |
| `frameflow:end` | `{ total }` when the album has no more pages |
| `frameflow:error` | `{ error }` when a page fails to load (a "Try again" button is shown) |
| `frameflow:click` | `{ index, item }` |
| `frameflow:open`, `frameflow:change`, `frameflow:close` | `{ index, item }` for the viewer |

```js
el.addEventListener('frameflow:open', e => analytics.track('photo_view', e.detail.item.id));
```

## Theming

Set these CSS custom properties on the gallery element or on `:root`:

```css
#album {
  --ff-radius: 6px;           /* tile corners */
  --ff-placeholder: #8883;    /* tile color before the image arrives */
  --ff-focus: #f2be22;        /* keyboard focus ring */
  --ff-fade: 260ms;           /* image fade-in */
  --ff-status-color: #667;    /* "Loading photos" / end text */
  --ff-lb-bg: #090b0dfa;      /* viewer backdrop */
  --ff-lb-fg: #fff;           /* viewer text and buttons */
}
```

## Performance notes

- Give every photo `w` and `h`. This is the single biggest speed-up, because layout can happen before any image downloads.
- Provide `srcset` or `imageUrl` so phones don't download desktop-sized files.
- A `color` per photo (its average color, computed when you upload) makes loading feel instant.
- With JSON sources, 20–50 photos per page works well.

## Browser support

Current Chrome, Edge, Firefox and Safari (Safari 15.4 or later, for `<dialog>`). Older browsers show the plain HTML fallback if you use it.

## How it compares

- **Infinite Scroll** (MIT since v5) loads pages but has no layout or viewer.
- **PhotoSwipe** (MIT) is an excellent viewer but has no grid or loading.
- **lightGallery** covers more, but needs a paid license for commercial sites.

Frameflow combines the three jobs in one small file and adds virtualization, which none of them do. If you need PhotoSwipe's deeper zoom features, you can set `lightbox: false` and open PhotoSwipe from the `frameflow:click` event.

## Development

```bash
npm install
npm run build        # dist/ and docs/index.html
npm test             # unit tests (layout, data sources, URL safety)
npm i -D playwright && npx playwright install chromium
npm run test:e2e     # browser tests: loading, virtualization, viewer, keyboard, mobile, security
```

The project layout:

- `src/` holds the source:
  - `layout.js` is the pure layout maths.
  - `frameflow.js` is the gallery.
  - `lightbox.js` is the viewer.
  - `source.js` handles data sources.
  - `items.js` validates photo data.
  - `styles.js` holds the CSS.
- `dist/` holds the built files and is committed, so CDNs can serve tagged releases.
- `docs/` holds the self-contained demo. Enable GitHub Pages from `/docs` to host it.
- `examples/` holds the JSON, plain HTML and Firebase examples.

## License

MIT
