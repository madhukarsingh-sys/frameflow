export interface FrameflowItem {
  /** Full-size image URL (also accepted as `url` or `full`). */
  src?: string;
  /** Smaller image for the grid (also accepted as `thumbnail`). */
  thumb?: string;
  /** "a.jpg 400w, b.jpg 800w" or [{ src, w }] */
  srcset?: string | Array<{ src?: string; url?: string; w?: number; width?: number }>;
  /** Original pixel size. Strongly recommended: without it the image is loaded once to measure it. */
  w?: number; h?: number; width?: number; height?: number;
  alt?: string;
  /** Shown in the viewer (also accepted as `title`). */
  caption?: string;
  /** Placeholder color while loading, e.g. "#c86b6b". */
  color?: string;
  /** Tiny data:image URL shown blurred while loading. */
  lqip?: string;
  id?: string | number;
  [key: string]: unknown;
}

export type FrameflowPage = Array<FrameflowItem | string> | {
  items: Array<FrameflowItem | string>;
  /** URL of the next page (relative URLs allowed); null ends the album. */
  next?: string | null;
  /** Opaque token for the next page, sent back as ?cursor=; null ends the album. */
  cursor?: string | null;
  nextPageToken?: string | null;
  done?: boolean;
};

export interface FrameflowOptions {
  layout?: 'justified' | 'masonry' | 'grid';
  rowHeight?: number;
  columnWidth?: number;
  gap?: number;
  /** e.g. "70vh" or 600 to scroll inside a frame. Omit to scroll with the page. */
  height?: string | number | null;
  /** JSON URL; may contain {page}. */
  src?: string | null;
  source?: ((ctx: { page: number; cursor: string | null; signal?: AbortSignal }) => FrameflowPage | Promise<FrameflowPage>) | null;
  items?: Array<FrameflowItem | string> | null;
  imageUrl?: ((item: FrameflowItem, width: number, kind: 'thumb' | 'full') => string | Promise<string>) | null;
  lightbox?: boolean;
  history?: boolean;
  captions?: boolean;
  measure?: boolean;
  preload?: number;
  buffer?: number;
  credentials?: RequestCredentials;
  /** Query parameter used to send a cursor token back. Default "cursor". */
  cursorParam?: string;
  injectStyles?: boolean;
  nonce?: string | null;
  text?: Partial<Record<'label' | 'viewer' | 'open' | 'close' | 'prev' | 'next' | 'loading' | 'end' | 'empty' | 'error' | 'retry', string>>;
}

export declare class Frameflow {
  constructor(el: Element | string, options?: FrameflowOptions);
  readonly items: ReadonlyArray<{ data: FrameflowItem; w: number; h: number; src: string }>;
  readonly done: boolean;
  readonly loading: boolean;
  append(items: Array<FrameflowItem | string> | FrameflowItem | string): Promise<number>;
  loadMore(): Promise<void>;
  retry(): void;
  open(index: number): void;
  close(): void;
  set(opts: Pick<FrameflowOptions, 'layout' | 'rowHeight' | 'columnWidth' | 'gap'>): void;
  refresh(): void;
  reveal(index: number): HTMLElement | null;
  destroy(): void;
  static autoInit(root?: ParentNode): Frameflow[];
  static version: string;
}

export declare function autoInit(root?: ParentNode): Frameflow[];
export declare const VERSION: string;
export default Frameflow;
