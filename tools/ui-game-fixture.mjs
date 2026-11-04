import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
const source = fs.readFileSync('index.html', 'utf8');
const scripts = [...source.matchAll(/<script\s+src="([^"]+)"[^>]*>/g)].map(x => x[1].split('?')[0]);
const html = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

export async function boot(full, { storage = {}, beforeScripts } = {}) {
  const errors = [], pending = new Set(), vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(String(e.stack)));
  vc.on('error', (...args) => errors.push(args.map(String).join(' ')));
  const dom = new JSDOM(html, { url: 'https://ui-test.invalid/?no_reload' + (full ? '&ui=svelte-hud' : ''), runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const g = dom.window;
  g.structuredClone = structuredClone;
  for (const [key, value] of Object.entries(storage)) g.localStorage.setItem(key, value);
  g.ResizeObserver = class { observe() {} disconnect() {} };
  g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  g.HTMLMediaElement.prototype.load = function () {};
  g.HTMLMediaElement.prototype.play = () => Promise.resolve();
  g.HTMLMediaElement.prototype.pause = function () {};
  g.fetch = async url => {
    const parsed = new URL(String(url), g.location.href);
    assert.equal(parsed.origin, g.location.origin, 'network access disabled');
    const file = path.resolve('.', '.' + decodeURIComponent(parsed.pathname));
    assert.ok(file.startsWith(process.cwd() + path.sep), 'fixture files stay within repo');
    const request = fs.promises.readFile(file); pending.add(request);
    try { const data = await request; return { ok: true, status: 200, json: async () => JSON.parse(data), text: async () => String(data) }; }
    finally { pending.delete(request); }
  };
  g.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  g.HTMLDialogElement.prototype.close = function () { this.open = false; };
  g.HTMLCanvasElement.prototype.getContext = function () {
    return new Proxy({ canvas: this, measureText: t => ({ width: String(t).length * 10 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), getImageData: () => ({ data: new Uint8ClampedArray(4) }) }, { get(o, k) { return o[k] ?? (() => {}); } });
  };
  async function drain() { for (let i = 0; i < 6; i++) { await Promise.allSettled([...pending]); await settle(); } }
  try {
    if (beforeScripts) beforeScripts(g);
    for (const file of scripts) {
      // JSDOM cannot decode raster art or import browser modules. Gameplay and
      // persistence run here; the production artwork is checked in-browser.
      if (file === 'js/gym-scene.js') { g.GymSceneArt={ready:Promise.resolve(),objects:()=>[]}; continue; }
      g.eval(fs.readFileSync(file, 'utf8') + '\n//# sourceURL=' + file);
    }
    await settle(); await g.AppBoot.ready; await drain();
    assert.deepEqual(errors, [], 'fresh game initializes without runtime errors');
  } catch (e) { g.SvelteCombat?.dispose(); g.SvelteInteractions?.dispose(); g.SvelteHUD?.dispose(); dom.window.close(); throw e; }
  return { g, errors, drain, async close() { await drain(); g.SceneRenderer.render = () => {}; g.SvelteCombat?.dispose(); g.SvelteInteractions?.dispose(); g.SvelteHUD?.dispose(); dom.window.close(); } };
}
