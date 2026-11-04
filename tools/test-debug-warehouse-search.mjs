import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';

for (const full of [false, true]) {
  test(`debug warehouse searches canonical and visible names without identifying items (${full ? 'Svelte' : 'native'})`, async () => {
    const h = await boot(full), g = h.g, d = g.document, IE = g.InventoryEquipment;
    try {
      g.DialogueUI.close(); g.SceneApp.openCharacterCreationAfterIntro(); await h.drain();
      const name = d.getElementById('creation-name'); name.value = '取物搜索测试';
      name.dispatchEvent(new g.Event('input', { bubbles: true })); await h.drain();
      d.getElementById('btn-confirm-creation').click(); await h.drain(); g.DialogueUI.close();
      g.GameEngine.setState('M0_Base_Inside_lv_1', 13, 12);
      assert.equal(g.StationContext.isAdjacentToWarehouseTile(), true);
      g.SceneApp.openBaseWarehousePanel(); await h.drain();
      assert.ok(d.querySelector('#modal-base-warehouse.show'));
      const rows = () => [...d.querySelectorAll('#base-warehouse-list .warehouse-item-row')];
      const find = id => rows().find(row => row.querySelector(`[data-item-id="${id}"]`));
      const search = async value => {
        const input = d.getElementById('base-warehouse-filter'); input.value = value;
        input.dispatchEvent(new g.Event('input', { bubbles: true })); await h.drain();
      };
      const initialCount = rows().length;
      const originalName = find('ore_scrap_metal').querySelector('.wname').textContent;
      assert.equal(originalName, '锈蚀铁块', 'unknown scrap has its existing appearance name');
      const stateBefore = JSON.stringify(IE.getState()), tickBefore = g.GameTime.getState().totalTicks;
      await search('ore_scrap_metal'); assert.equal(rows().length, 1);
      await search('锈蚀铁块'); assert.equal(rows().length, 1);
      await search('废铁');
      assert.ok(find('ore_scrap_metal'), 'searching 废铁 must find the scrap metal template');
      assert.equal(find('ore_scrap_metal').querySelector('.wname').textContent, originalName);
      await search('  ORE_SCRAP_METAL  '); assert.equal(rows().length, 1);
      for (const [query, id] of [['陶土', 'ore_clay_raw'], ['机械零件', 'mechanical_parts']]) {
        await search(query); assert.ok(find(id), query + ' canonical name remains searchable');
      }
      await search('not-a-real-material'); assert.equal(rows().length, 0);
      await search('   '); assert.equal(rows().length, initialCount);
      assert.equal(JSON.stringify(IE.getState()), stateBefore, 'search does not identify or grant items');
      assert.equal(g.GameTime.getState().totalTicks, tickBefore, 'search costs no game time');
      await search('废铁');
      const before = IE.countCarriedItemsByTemplateId('ore_scrap_metal');
      find('ore_scrap_metal').querySelector('button').click(); await h.drain();
      assert.equal(IE.countCarriedItemsByTemplateId('ore_scrap_metal'), before + 1);
      assert.equal(g.GameTime.getState().totalTicks, tickBefore + 1, 'take still costs one normal tick');
      assert.equal(IE.getDisplayName(IE.getItemTemplate('ore_scrap_metal'), IE.getItemDisplayTier('ore_scrap_metal')), originalName);
      assert.deepEqual(h.errors, []);
    } finally { await h.close(); }
  });
}
