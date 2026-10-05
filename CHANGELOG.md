# Changelog

## 1.0.0 — 2026-10-04

First release.

- Justified rows, masonry and square grid layouts, all append-stable.
- Infinite loading from a JSON URL (`{page}`, `next` links or cursors), a custom function, or existing `<img>` markup.
- Virtualized rendering: only tiles near the screen are in the DOM, so large albums stay smooth.
- Scrolls inside a fixed-height frame or with the page.
- Full-screen viewer on `<dialog>`: swipe, pinch and double-tap zoom, pan, swipe down to close, keyboard, trackpad gestures, back button closes it.
- Responsive images through `srcset` or an `imageUrl()` resolver for image CDNs.
- Placeholder color or tiny blurred preview per photo.
- Arrow-key navigation through tiles, focus restored after the viewer closes, reduced motion respected.
- Untrusted data handling: URL protocol allow-list, text rendered as text only, validated colors.
