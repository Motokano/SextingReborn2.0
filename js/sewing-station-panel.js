/* Base sewing facility entry. Production state is separate from the disposable UI demo. */
(function (g) {
    'use strict';
    var root = null, previousFocus = null;
    function nearby() {
        var E = g.GameEngine, st = E && E.getState();
        return !!(st && st.mapId === 'M0_Base_Inside_lv_1' &&
            Math.max(Math.abs(st.x - 6), Math.abs(st.y - 11)) === 1 &&
            E.getInteractNpcIdAt(6, 11) === 'npc.station.sewing_base');
    }
    function ready() { return nearby() && !!g.NPCSystem.isDemoFlagTrue('sewing_station_unlocked'); }
    function bucketStock() { return Math.max(0, Math.min(50, Math.floor(Number(g.NPCSystem.getFlagValue('sewing_bucket_stock')) || 0))); }
    function snapshot() {
        if (!root || !ready()) return null;
        return {
            bucketUnlocked: g.NPCSystem.isDemoFlagTrue('sewing_bucket_unlocked'),
            bucket: bucketStock(),
            leaves: g.InventoryEquipment.countCarriedItemsByTemplateId('silica_leaf'),
            measurement: g.NPCSystem.getFlagValue('sewing_measurement') || null,
            mannequin: g.NPCSystem.getFlagValue('sewing_mannequin_dimensions') || null
        };
    }
    function refill(n) {
        if (!root || !ready() || !g.NPCSystem.isDemoFlagTrue('sewing_bucket_unlocked')) return {ok:false,message:'请在已装配的浸泡桶旁操作。'};
        var IE = g.InventoryEquipment, before = bucketStock();
        if (!Number.isSafeInteger(n) || n < 1 || n > 50 - before || n > IE.countCarriedItemsByTemplateId('silica_leaf')) return {ok:false,message:'硅叶数量不足或超出桶容量。'};
        var inventory = JSON.parse(JSON.stringify(IE.getState())), npc = g.NPCSystem.getDemoState();
        try {
            if (!IE.removeCarriedItemsByTemplateId('silica_leaf', n, {strict:true}).ok) throw Error('inventory');
            g.NPCSystem.setDemoFlag('sewing_bucket_stock', before + n);
            if (!g.SaveSystem || !g.SaveSystem.saveNow()) throw Error('save');
            return {ok:true,message:'已补充' + n + '份硅叶。'};
        } catch (e) {
            IE.setState(inventory); g.NPCSystem.setDemoState(npc);
            return {ok:false,message:'补充未能保存，硅叶已退回。'};
        }
    }
    function installBucket() {
        if (!root || !ready()) return {ok:false,message:'请靠近缝纫台后操作。'};
        var p = g.FacilityUnlock && g.FacilityUnlock.get('sewing_bucket');
        if (!p || !p.accessible()) return {ok:false,message:'浸泡桶已装配或暂时无法装配。'};
        if (!g.FacilityUnlockPanel || g.FacilityUnlockPanel.isOpen()) return {ok:false,message:'请先关闭其他装配界面。'};
        if (g.SewingSystem && g.SewingSystem.jobState()) return {ok:false,message:'请先完成或停止当前工作。'};
        g.FacilityUnlockPanel.open('sewing_bucket', function () { if (ready()) open(); });
        if (!g.FacilityUnlockPanel.isOpen()) return {ok:false,message:'装配界面未能打开，请稍后再试。'};
        close();
        return {ok:true,message:'已打开浸泡桶装配。'};
    }
    function close() {
        if (g.SewingSystem) g.SewingSystem.cancel();
        if (!root) return;
        root.remove(); root = null;
        if (previousFocus && previousFocus.isConnected) previousFocus.focus();
        previousFocus = null;
    }
    function open() {
        if (root || !ready()) return false;
        if ((g.ToolbenchPanel && g.ToolbenchPanel.isOpen()) || (g.HideoutWarehousePanel && g.HideoutWarehousePanel.isOpen())) return false;
        previousFocus = document.activeElement;
        root = document.createElement('div'); root.id = 'sewing-station-panel';
        root.style.cssText = 'position:fixed;inset:0;z-index:200;background:#081009bb;display:grid;place-items:center';
        root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', '缝纫台');
        var frame = document.createElement('iframe'); frame.title = '缝纫台'; frame.src = 'sewing-station.html?no_reload=';
        frame.style.cssText = 'width:min(1252px,98vw);height:96vh;border:0;background:transparent';
        root.appendChild(frame); document.body.appendChild(root); frame.focus();
        return true;
    }
    g.SewingStationPanel = {open:open,close:close,isOpen:function(){return !!root;},canAccess:ready,snapshot:snapshot,refill:refill,installBucket:installBucket};
})(window);
