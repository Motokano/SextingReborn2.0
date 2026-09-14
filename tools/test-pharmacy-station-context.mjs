import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Exercise the same repair check invoked while building the NPC use button.
let repaired = true;
let nearby = true;
let bound = true;
const mapId = 'M0_Base_Inside_lv_1';
const context = {
  GameEngine: {
    getState: () => ({ mapId, x: 14, y: 14 }),
    getMap: () => ({ map_id: mapId }),
    getEntityRecordAt: () => null,
    getAnnotationAt: (x, y) => nearby && x === 14 && y === 15 ? '制药台' : null,
    getPharmacyStationInteractNpcId: (x, y) => bound && x === 14 && y === 15 ? 'npc.station.pharmacy_base' : null
  },
  NPCSystem: {
    isDemoFlagTrue: flag => {
      assert.equal(flag, 'npc_station_pharmacy_base_repaired');
      return repaired;
    }
  }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../js/station-context.js', import.meta.url), 'utf8'), context);
const station = context.StationContext;
assert.equal(station.isPharmacyUiBlockedByRepair(), false, 'repaired station enables the use button');
assert.equal(station.getCurrentPharmacyStationContext().station_type, 'main');
repaired = false;
assert.equal(station.isPharmacyUiBlockedByRepair(), true, 'unrepaired station keeps the button disabled');
bound = false;
assert.equal(station.isPharmacyUiBlockedByRepair(), false, 'unbound stations need no repair');
nearby = false;
assert.equal(station.getCurrentPharmacyStationContext(), null, 'distant stations cannot be used');
console.log('Pharmacy station repair/menu guard regression passed.');
