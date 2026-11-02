import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
const filePath=f=>f;
const read=f=>fs.readFileSync(f,'utf8');
const source = read('index.html');
const scripts = [...source.matchAll(/<script\s+src="([^"]+)"[^>]*>/g)].map(x => x[1].split('?')[0]);
const html = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

export async function boot(full, { storage = {}, jsonOverrides = {} } = {}) {
  const errors = [], pending = new Set(), vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(String(e.stack)));
  vc.on('error', (...args) => errors.push(args.map(String).join(' ')));
  const dom = new JSDOM(html, { url: 'https://ui-test.invalid/?no_reload' + (full ? '&ui=svelte-hud' : ''), runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const g = dom.window;
  for (const [key, value] of Object.entries(storage)) g.localStorage.setItem(key, value);
  g.structuredClone = structuredClone;
  g.ResizeObserver = class { observe() {} disconnect() {} };
  g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  g.HTMLMediaElement.prototype.load = function () {};
  g.HTMLMediaElement.prototype.play = () => Promise.resolve();
  g.HTMLMediaElement.prototype.pause = function () {};
  g.fetch = async url => {
    const parsed = new URL(String(url), g.location.href);
    assert.equal(parsed.origin, g.location.origin, 'network access disabled');
    const overrideKey = decodeURIComponent(parsed.pathname).replace(/^\//, '');
    if (Object.hasOwn(jsonOverrides, overrideKey)) return { ok: true, status: 200, json: async () => structuredClone(jsonOverrides[overrideKey]), text: async () => JSON.stringify(jsonOverrides[overrideKey]) };
    const file = path.resolve('.', '.' + decodeURIComponent(parsed.pathname));
    assert.ok(file.startsWith(process.cwd() + path.sep), 'fixture files stay within repo');
    const request = fs.promises.readFile(filePath(file)); pending.add(request);
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
    for (const file of scripts) g.eval(read(file) + '\n//# sourceURL=' + file);
    await settle(); await g.AppBoot.ready; await drain();
    assert.deepEqual(errors, [], 'fresh game initializes without runtime errors');
  } catch (e) { g.SvelteCombat?.dispose(); g.SvelteInteractions?.dispose(); g.SvelteHUD?.dispose(); dom.window.close(); throw e; }
  return { g, errors, drain, async close() { await drain(); g.SceneRenderer.render = () => {}; g.SvelteCombat?.dispose(); g.SvelteInteractions?.dispose(); g.SvelteHUD?.dispose(); dom.window.close(); } };
}
