// Entry for the <script> tag build: exposes window.Frameflow and sets up
// every [data-frameflow] element once the page has loaded.
// Add data-manual to the script tag to skip the automatic setup.
import Frameflow, { autoInit } from './frameflow.js';

const script = typeof document !== 'undefined' ? document.currentScript : null;
if (typeof window !== 'undefined') window.Frameflow = Frameflow;

if (typeof document !== 'undefined' && !(script && script.hasAttribute('data-manual'))) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => autoInit());
  else autoInit();
}
