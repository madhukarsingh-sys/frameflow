// Builds dist/ and the self-contained demo in docs/.
// Usage: node build.mjs
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const banner = `/*! Frameflow v${JSON.parse(await readFile('package.json', 'utf8')).version} | MIT License */`;
const common = { bundle: true, target: ['es2019'], banner: { js: banner }, legalComments: 'none', logLevel: 'warning' };

await mkdir('dist', { recursive: true });
await build({ ...common, entryPoints: ['src/frameflow.js'], format: 'esm', outfile: 'dist/frameflow.esm.js' });
await build({ ...common, entryPoints: ['src/browser.js'], format: 'iife', outfile: 'dist/frameflow.js' });
await build({ ...common, entryPoints: ['src/browser.js'], format: 'iife', minify: true, outfile: 'dist/frameflow.min.js' });

// Plain CSS file for strict CSP setups that disable style injection.
const { CSS } = await import('./src/styles.js');
await writeFile('dist/frameflow.css', `${banner}\n${CSS.trim()}\n`);

// Self-contained demo: inline the library and the demo script.
const min = await readFile('dist/frameflow.min.js', 'utf8');
const scenes = await readFile('demo/scenes.js', 'utf8');
let html = await readFile('demo/index.html', 'utf8');
html = html
  .replace('<script src="../dist/frameflow.min.js" data-manual></script>', () => `<script data-manual>\n${min}</script>`)
  .replace('<script src="scenes.js"></script>', () => `<script>\n${scenes}</script>`);
await mkdir('docs', { recursive: true });
await writeFile('docs/index.html', html);

const size = gzipSync(min).length;
console.log(`dist/frameflow.min.js  ${(min.length / 1024).toFixed(1)} KB, ${(size / 1024).toFixed(1)} KB gzipped`);
