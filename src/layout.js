// Pure layout functions. No DOM access, so they can be unit-tested in Node.
// Every layout is deterministic and append-stable: adding items to the end
// never moves items that were already placed (except the last, unfinished
// row of a justified layout, which is by design not stretched yet).

const MIN_RATIO = 0.25; // tallest allowed tile is 4x taller than wide
const MAX_RATIO = 5;    // widest allowed tile is 5x wider than tall

export function ratioOf(item) {
  const w = item && item.w, h = item && item.h;
  if (w > 0 && h > 0 && Number.isFinite(w / h)) {
    return Math.min(MAX_RATIO, Math.max(MIN_RATIO, w / h));
  }
  return 1;
}

/**
 * @param {Array<{w:number,h:number}>} items
 * @param {number} width  available width in px
 * @param {{mode?:string, gap?:number, rowHeight?:number, columnWidth?:number}} opts
 * @returns {{boxes:Array<{x:number,y:number,w:number,h:number}>, height:number}}
 */
export function layout(items, width, opts = {}) {
  const W = Math.floor(Number(width) || 0);
  const gap = Math.max(0, Number(opts.gap) || 0);
  if (!items || !items.length || W <= 0) return { boxes: [], height: 0 };
  switch (opts.mode) {
    case 'masonry': return masonry(items, W, gap, opts.columnWidth || 240);
    case 'grid': return grid(items, W, gap, opts.columnWidth || 240);
    default: return justified(items, W, gap, opts.rowHeight || 220);
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
    if (h > target) continue; // row not full yet

    if (row.length > 1) {
      // Would the row look better without this item? Compare how far each
      // option is from the target height (as a ratio, so both sides are fair).
      const hPrev = rowHeight(row.length - 1, sum - r);
      if (hPrev <= maxH && hPrev / target < target / h) {
        row.pop();
        place(row, hPrev, true);
        row = [i];
        sum = r;
        const hSolo = rowHeight(1, sum);
        if (hSolo <= target) { place(row, hSolo, true); row = []; sum = 0; }
        continue;
      }
    }
    place(row, h, true);
    row = [];
    sum = 0;
  }
  // Last, unfinished row: keep the target height, do not stretch to fill.
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
