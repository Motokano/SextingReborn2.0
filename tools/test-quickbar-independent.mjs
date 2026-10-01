import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const dock = { style: { left: '320px', top: '240px', bottom: 'auto' } };
let logTop = 500;
const panel = { getBoundingClientRect: () => ({ top: logTop }) };
const document = { readyState: 'loading', addEventListener() {}, getElementById: id => id === 'game-log-panel' ? panel : id === 'bottom-hud-stack' ? dock : null };
const window = { innerHeight: 800 };
vm.runInNewContext(readFileSync(new URL('../js/game-log.js', import.meta.url), 'utf8'), { window, document });
const before = { ...dock.style };
for (const top of [500, 220, 710]) {
    logTop = top;
    window.GameLog.syncQuickBeltDock();
    window.GameLog.clampLogPanelForLeftHud();
    assert.deepEqual(dock.style, before, 'Moving/resizing the log must not reposition the shortcut bar');
}
console.log('PASS shortcut position remains independent of log layout');
