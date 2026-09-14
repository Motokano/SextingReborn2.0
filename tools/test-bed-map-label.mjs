import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const readJson = async (file) => JSON.parse(await fs.readFile(new URL(file, root), 'utf8'));
const source = await fs.readFile(new URL('js/npc-system.js', root), 'utf8');
async function checkPreload(map) {
    const context = vm.createContext({
        fetch: async (file) => ({ ok: true, json: () => readJson(file) })
    });
    vm.runInContext(source, context);
    const npc = context.NPCSystem;
    assert.equal(npc.getNpcMapLabel('npc.station.bed_base'), '');
    await npc.preloadNpcsFromMap(map);
    assert.equal(npc.getNpcMapLabel('npc.station.bed_base'), '床',
        'Map preload must load the bed label before any bed interaction');
}

await checkPreload(await readJson('data/maps/M0_Base_Inside_lv_1.json'));
await checkPreload({ bed_station_interact_npc_id: 'npc.station.bed_base' });
await checkPreload({ bed_station_interact_npc_by_cell: { '11,15': 'npc.station.bed_base' } });
console.log('Bed map labels: actual map and both binding formats passed.');
