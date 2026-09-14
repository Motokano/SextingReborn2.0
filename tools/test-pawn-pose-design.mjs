import fs from 'node:fs';
import assert from 'node:assert/strict';
const data = JSON.parse(fs.readFileSync(new URL('../assets/map/isometric/concepts/shared-pose-map-v2.json', import.meta.url), 'utf8'));
assert.equal(data.combinations.length, 128);
assert.equal(new Set(data.combinations.map(x => x.destroyMask)).size, 128);
for (let mask = 0; mask < 128; mask++) {
  const state = data.combinations.find(x => x.destroyMask === mask);
  const expectedDestroyed = data.partOrder.filter((_, i) => mask & (1 << i));
  assert.deepEqual(state.destroyed, expectedDestroyed);
  assert.deepEqual(state.hiddenParts, expectedDestroyed.filter(x => !['head','chest','abdomen'].includes(x)));
  assert.deepEqual(state.injuryLayers.map(x => x.part), expectedDestroyed.filter(x => ['head','chest','abdomen'].includes(x)));
  for (const part of ['head','chest','abdomen']) assert.ok(state.visibleParts.includes(part));
  for (const part of state.activeContacts) assert.ok(!state.destroyed.includes(part), `${state.id}: disabled active support`);
  for (const part of state.passiveContacts) assert.ok(state.visibleParts.includes(part));
  for (const hand of Object.keys(state.handActions)) {
    assert.ok(!state.destroyed.includes(hand));
    assert.ok(!state.lockedHands.includes(hand));
  }
  if (['P3','P4','P5'].includes(state.pose)) {
    assert.ok(state.hiddenParts.includes('lfoot') && state.hiddenParts.includes('rfoot'));
    assert.deepEqual(state.handActions, {});
    assert.ok(!state.torsoPosture.includes('standing'));
  }
  if (state.pose === 'P5') assert.equal(state.torsoPosture, 'side_lying');
}
// Every upper-body combination must retain its legless support family, including
// both one-handed sides. Restoration must exactly return to its U0 baseline.
for (const limbMask of [12,13,14,15]) {
  const family = data.combinations.filter(x => x.limbMask === limbMask);
  assert.equal(family.length, 8);
  for (const state of family) {
    assert.equal(state.pose, family[0].pose);
    assert.deepEqual(state.activeContacts, family[0].activeContacts);
    assert.deepEqual(state.passiveContacts, family[0].passiveContacts);
    const restored = data.combinations.find(x => x.destroyMask === (state.destroyMask & ~7));
    assert.equal(restored.upperMask, 0);
    assert.deepEqual(restored.injuryLayers, []);
  }
}
const combos = {M1:['rhand','rfoot'], M2:['rhand','lfoot'], M3:['lhand','rfoot'], M4:['lhand','lfoot']};
for (const state of data.combinations.filter(x => x.pose.startsWith('M'))) {
  assert.deepEqual(state.visibleParts.filter(x => x.endsWith('hand') || x.endsWith('foot')), combos[state.pose]);
}
console.log('PASS: 128 states; 32 legless variants; anatomical sides, contacts, free hands and restoration. Design data only; rendered geometry not tested.');
