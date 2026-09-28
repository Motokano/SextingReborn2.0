/**
 * 藏身处账号仓库面板 — 渲染、存取与扩建子层。
 * 设计正本：docs/design/29-hideout-warehouse.md
 */
(function (global) {
    'use strict';

    var PAGE_SIZE = 100;
    var GRID_COLS = 10;
    var DEFAULT_CONSTRUCTION_TICK_MS = 2000;
    var panelOpen = false;
    var eventsBound = false;
    var constructionTimerId = null;
    var constructionRequested = false, projectMessage = "";

    var uiState = {
        page: 1,
        pageSize: PAGE_SIZE,
        selectedSlot: null,
        filterTab: 'all',
        upgradeOverlayOpen: false,
        selectedUpgradeId: null
    };

    function t(key, params) {
        if (global.UIText && typeof global.UIText.t === 'function') {
            return global.UIText.t(key, params);
        }
        return key;
    }

    function escHtml(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getHW() {
        return global.HideoutWarehouse || null;
    }

    function getIE() {
        return global.InventoryEquipment || null;
    }

    function getCharacter() {
        return (global.SceneCtx && global.SceneCtx.character) ? global.SceneCtx.character : null;
    }

    function showMsg(text, type) {
        if (global.SceneCtx && typeof global.SceneCtx.showMsg === 'function') {
            global.SceneCtx.showMsg(text, type || 'info');
        }
    }

    function getItemTemplate(itemId) {
        var IE = getIE();
        if (!IE || typeof IE.getItemTemplate !== 'function') return null;
        return IE.getItemTemplate(itemId);
    }

    function resolveItemLabel(itemId, tpl) {
        var char = getCharacter();
        var IE = getIE();
        if (tpl && IE && typeof IE.getDisplayName === 'function') {
            var tier = IE.getItemDisplayTier ? IE.getItemDisplayTier(itemId, char) : 0;
            var name = String(IE.getDisplayName(tpl, tier, char) || '').trim();
            if (name) return name;
            if (tpl.sn) return String(tpl.sn);
            if (tpl.placeholder_name) return String(tpl.placeholder_name);
        }
        return t('hideout_warehouse.item.unknown');
    }

    function resolveItemDisplay(itemId, inst) {
        var tpl = getItemTemplate(itemId);
        var char = getCharacter();
        var IE = getIE();
        var tier = IE && IE.getItemDisplayTier ? IE.getItemDisplayTier(itemId, char) : 0;
        var name = resolveItemLabel(itemId, tpl);
        var desc = tpl && IE && IE.getDisplayDesc
            ? String(IE.getDisplayDesc(tpl, tier, char) || '')
            : '';
        var count = inst && inst.count != null ? Math.max(1, Math.floor(Number(inst.count))) : 1;
        return { tpl: tpl, name: name, desc: desc, count: count };
    }

    function resolveUpgradeDisplayName(entry) {
        if (entry && entry.name) return String(entry.name);
        return t('hideout_warehouse.upgrade.unnamed');
    }

    function abbreviateLabel(name, maxLen) {
        var s = String(name || '').trim();
        if (!s) return '';
        var limit = maxLen != null ? maxLen : 4;
        if (s.length <= limit) return s;
        return s.slice(0, limit);
    }

    function getContainerArray(containerType) {
        var IE = getIE();
        if (!IE) return null;
        if (containerType === 'pocket' && typeof IE.getPocketArray === 'function') return IE.getPocketArray();
        if (containerType === 'vest' && typeof IE.getVestArray === 'function') return IE.getVestArray();
        if (containerType === 'backpack' && typeof IE.getBackpackArray === 'function') return IE.getBackpackArray();
        if (containerType === 'vehicle') {
            if (typeof IE.getState !== 'function') return null;
            var st = IE.getState();
            if (!st || !st.bound_vehicle_id) return null;
            return Array.isArray(st.inventory_vehicle) ? st.inventory_vehicle : null;
        }
        return null;
    }

    function getTotalPages(capacity) {
        var cap = Math.max(1, Math.floor(Number(capacity) || 1));
        return Math.max(1, Math.ceil(cap / uiState.pageSize));
    }

    function clampPage(page, capacity) {
        var total = getTotalPages(capacity);
        var p = Math.floor(Number(page) || 1);
        if (p < 1) p = 1;
        if (p > total) p = total;
        return p;
    }

    var MATERIAL_CATEGORIES = {
        material: true, herb: true, ore: true, wood: true, textile: true,
        supply: true, seed: true, hunt: true, currency: true, food: true
    };

    function itemMatchesFilterTab(inst, tab) {
        if (tab === 'all' || !inst || !inst.item_id) return tab === 'all';
        var tpl = getItemTemplate(inst.item_id);
        if (tab === 'starred') return !!inst.warehouse_starred;
        if (tab === 'locked') return !!inst.warehouse_locked;
        if (tab === 'perishable') {
            return tpl && Math.floor(Number(tpl.spoilage_ticks) || 0) > 0;
        }
        if (tab === 'materials') {
            return !!(tpl && tpl.category && MATERIAL_CATEGORIES[String(tpl.category)]);
        }
        if (tab === 'equipment') {
            if (tpl && tpl.equip_slot) return true;
            if (!tpl || !tpl.category) return false;
            var cat = String(tpl.category);
            return cat === 'armor' || cat === 'weapon' || cat === 'tool';
        }
        return true;
    }

    function slotPassesFilter(inst) {
        return itemMatchesFilterTab(inst, uiState.filterTab);
    }

    function isOutpostView() {
        var HW = getHW();
        return HW && typeof HW.isOutpostMode === 'function' && HW.isOutpostMode();
    }

    function hasPinQoL() {
        var HW = getHW();
        return HW && HW.hasQoL && HW.hasQoL('qol_lock_and_pin');
    }

    function renderCapacity(used, capacity) {
        var capEl = document.getElementById('hw-capacity-num');
        if (capEl) capEl.textContent = String(used) + ' / ' + String(capacity);
        var suffixEl = document.querySelector('#modal-hideout-warehouse .hw-capacity [data-ui="hideout_warehouse.capacity.suffix"]');
        if (suffixEl) suffixEl.textContent = t('hideout_warehouse.capacity.suffix');
    }

    function renderHeaderBadges() {
        var HW = getHW();
        var frostBadge = document.getElementById('hw-badge-frost');
        if (frostBadge) {
            var coldOn = HW && typeof HW.hasColdStorage === 'function' && HW.hasColdStorage();
            frostBadge.classList.toggle('hw-hidden', !coldOn);
        }
        var outpostBadge = document.getElementById('hw-badge-outpost');
        if (outpostBadge) {
            var outpostOn = isOutpostView();
            outpostBadge.classList.toggle('hw-hidden', !outpostOn);
        }
    }

    function renderQoLChrome() {
        var HW = getHW();
        var tidyBtn = document.getElementById('hw-btn-tidy');
        if (tidyBtn) {
            var showTidy = HW && HW.hasQoL && HW.hasQoL('qol_tidy_one_click');
            tidyBtn.classList.toggle('hw-hidden', !showTidy);
        }
        var settingsBtn = document.getElementById('hw-btn-settings');
        if (settingsBtn) {
            var showSettings = HW && HW.hasQoL && HW.hasQoL('qol_craft_stash');
            settingsBtn.classList.toggle('hw-hidden', !showSettings);
            if (showSettings && HW.getPreferDeductWarehouse) {
                var on = HW.getPreferDeductWarehouse();
                settingsBtn.classList.toggle('hw-btn-active', on);
                settingsBtn.title = on
                    ? t('hideout_warehouse.settings.prefer_warehouse_on')
                    : t('hideout_warehouse.settings.prefer_warehouse_off');
            }
        }
        var stripEl = document.getElementById('hw-container-strip');
        if (stripEl) {
            var showDepositAll = HW && HW.hasQoL && HW.hasQoL('qol_deposit_all');
            var depositBtns = stripEl.querySelectorAll('.hw-container-deposit');
            var di;
            for (di = 0; di < depositBtns.length; di++) {
                depositBtns[di].classList.toggle('hw-hidden', !showDepositAll);
            }
        }
    }

    function renderPagerInfo(page, totalPages) {
        var infoEl = document.getElementById('hw-pager-info');
        if (infoEl) {
            infoEl.textContent = t('hideout_warehouse.pager.page_label', {
                page: page,
                totalPages: totalPages,
                pageSize: uiState.pageSize
            });
        }
        var numEl = document.getElementById('hw-pager-num');
        var totalEl = document.getElementById('hw-pager-total');
        if (numEl) numEl.textContent = String(page);
        if (totalEl) totalEl.textContent = String(totalPages);
        var prevBtn = document.getElementById('hw-pager-prev');
        var nextBtn = document.getElementById('hw-pager-next');
        if (prevBtn) {
            prevBtn.disabled = page <= 1;
            prevBtn.classList.toggle('hw-btn-disabled', page <= 1);
        }
        if (nextBtn) {
            nextBtn.disabled = page >= totalPages;
            nextBtn.classList.toggle('hw-btn-disabled', page >= totalPages);
        }
    }

    function buildSlotCell(globalIndex, inst, selected) {
        var cell = document.createElement('div');
        cell.className = 'hw-slot-cell' + (selected ? ' selected' : '');
        cell.setAttribute('data-slot-index', String(globalIndex));

        if (!inst || !inst.item_id) {
            var empty = document.createElement('span');
            empty.className = 'hw-slot-empty';
            empty.textContent = t('hideout_warehouse.slot.empty');
            cell.appendChild(empty);
            return cell;
        }

        var disp = resolveItemDisplay(inst.item_id, inst);
        cell.setAttribute('role','button');cell.tabIndex=0;
        cell.setAttribute('aria-label',disp.name+' × '+disp.count);
        cell.title=disp.name+' × '+disp.count;
        cell.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();handleSlotClick(globalIndex);}});
        var label = document.createElement('span');
        label.className = 'hw-slot-label';
        label.textContent = abbreviateLabel(disp.name, 4);
        cell.appendChild(label);

        if (disp.count > 1) {
            var cnt = document.createElement('span');
            cnt.className = 'hw-slot-count';
            cnt.textContent = '×' + disp.count;
            cell.appendChild(cnt);
        }

        var HW = getHW();
        var coldOn = HW && typeof HW.hasColdStorage === 'function' && HW.hasColdStorage();
        var perishable = disp.tpl && disp.tpl.spoilage_ticks != null
            && Math.floor(Number(disp.tpl.spoilage_ticks)) > 0;
        if (perishable) {
            var rot = document.createElement('span');
            rot.className = coldOn ? 'hw-slot-frost' : 'hw-slot-rot';
            rot.textContent = coldOn
                ? t('hideout_warehouse.badge.frozen')
                : t('hideout_warehouse.badge.perishable');
            cell.appendChild(rot);
        }

        if (hasPinQoL()) {
            if (inst.warehouse_starred) {
                var star = document.createElement('span');
                star.className = 'hw-slot-star';
                star.textContent = '★';
                cell.appendChild(star);
            }
            if (inst.warehouse_locked) {
                var lock = document.createElement('span');
                lock.className = 'hw-slot-lock';
                lock.textContent = '🔒';
                cell.appendChild(lock);
            }
        }

        return cell;
    }

    function renderSlotGrid(slots, capacity) {
        var gridEl = document.getElementById('hw-slot-grid');
        if (!gridEl) return;

        uiState.page = clampPage(uiState.page, capacity);
        var totalPages = getTotalPages(capacity);
        var page = uiState.page;
        var start = (page - 1) * uiState.pageSize;
        var end = Math.min(start + uiState.pageSize, capacity);

        gridEl.innerHTML = '';
        var i;
        for (i = start; i < end; i++) {
            var inst = slots[i] || null;
            if (!slotPassesFilter(inst)) inst = null;
            var selected = uiState.selectedSlot === i;
            gridEl.appendChild(buildSlotCell(i, inst, selected));
        }

        var rendered = end - start;
        var pad = GRID_COLS - (rendered % GRID_COLS);
        if (pad < GRID_COLS && rendered > 0) {
            for (i = 0; i < pad; i++) {
                var filler = document.createElement('div');
                filler.className = 'hw-slot-cell hw-slot-filler';
                filler.setAttribute('aria-hidden', 'true');
                filler.style.visibility = 'hidden';
                filler.style.pointerEvents = 'none';
                gridEl.appendChild(filler);
            }
        }

        renderPagerInfo(page, totalPages);
    }

    function renderDetail(slotIndex) {
        var detailEl = document.getElementById('hw-detail');
        if (!detailEl) return;

        var HW = getHW();
        if (!HW || slotIndex == null || slotIndex < 0) {
            detailEl.innerHTML =
                '<div class="hw-detail-head"><div>' +
                '<h3 class="hw-detail-name">' + escHtml(t('hideout_warehouse.detail.empty_title')) + '</h3>' +
                '<div class="hw-detail-meta">' + escHtml(t('hideout_warehouse.detail.empty_hint')) + '</div>' +
                '</div><div class="hw-detail-accent" aria-hidden="true"></div></div>';
            return;
        }

        var st = HW.getState();
        if (!st || !Array.isArray(st.slots) || slotIndex >= st.slots.length) {
            renderDetail(null);
            return;
        }
        var inst = st.slots[slotIndex];
        if (!inst || !inst.item_id) {
            uiState.selectedSlot = null;
            renderDetail(null);
            return;
        }

        var disp = resolveItemDisplay(inst.item_id, inst);
        var char = getCharacter();
        var qtySuffix = disp.count > 1 ? ' ×' + disp.count : '';
        var outpost = isOutpostView();
        var locked = !!inst.warehouse_locked;
        var starred = !!inst.warehouse_starred;
        var pinQoL = hasPinQoL();
        var fillQoL = HW && HW.hasQoL && HW.hasQoL('qol_withdraw_fill');

        var html = '';
        html += '<div class="hw-detail-head"><div>';
        html += '<h3 class="hw-detail-name">' + escHtml(disp.name + qtySuffix) + '</h3>';
        html += '</div><div class="hw-detail-accent" aria-hidden="true"></div></div>';

        if (pinQoL) {
            html += '<div class="hw-detail-meta-row">';
            html += '<button type="button" class="hw-btn-secondary hw-btn-sm" id="hw-btn-star">' +
                escHtml(starred ? t('hideout_warehouse.btn.unstar') : t('hideout_warehouse.btn.star')) + '</button>';
            html += '<button type="button" class="hw-btn-secondary hw-btn-sm" id="hw-btn-lock">' +
                escHtml(locked ? t('hideout_warehouse.btn.unlock') : t('hideout_warehouse.btn.lock')) + '</button>';
            html += '</div>';
        }

        if (disp.desc) {
            html += '<div><div class="hw-hub-title">' + escHtml(t('hideout_warehouse.detail.section.desc')) + '</div>';
            html += '<p class="hw-detail-desc">' + escHtml(disp.desc) + '</p></div>';
        }

        try {
            if (global.ItemInfoModules && typeof global.ItemInfoModules.renderTooltipModulesHtml === 'function') {
                var modulesHtml = global.ItemInfoModules.renderTooltipModulesHtml({
                    itemId: inst.item_id,
                    tpl: disp.tpl,
                    inst: inst,
                    character: char
                });
                if (modulesHtml) {
                    html += '<div class="hw-detail-module"><div class="hw-hub-title">' +
                        escHtml(t('hideout_warehouse.detail.section.spec')) + '</div>' +
                        '<div class="bp-detail-modules">' + modulesHtml + '</div></div>';
                }
            }
        } catch (eMod) { /* ignore */ }

        html += '<div class="hw-detail-actions">';
        html += '<button type="button" class="hw-btn-primary hw-btn-lg" id="hw-btn-withdraw-all"' +
            (outpost || locked ? ' disabled' : '') + '>' +
            escHtml(t('hideout_warehouse.btn.withdraw_all')) + '</button>';
        html += '<button type="button" class="hw-btn-secondary hw-btn-lg" id="hw-btn-withdraw-one"' +
            (outpost || locked ? ' disabled' : '') + '>' +
            escHtml(t('hideout_warehouse.btn.withdraw_one')) + '</button>';
        if (fillQoL) {
            html += '<button type="button" class="hw-btn-secondary hw-btn-lg" id="hw-btn-withdraw-fill"' +
                (outpost || locked ? ' disabled' : '') + '>' +
                escHtml(t('hideout_warehouse.btn.withdraw_fill')) + '</button>';
        }
        html += '<div id="hw-withdraw-hint" class="hw-withdraw-hint' +
            (outpost ? '' : ' hw-hidden') + '">' +
            escHtml(t('hideout_warehouse.hint.withdraw_blocked')) + '</div>';
        if (locked && !outpost) {
            html += '<div class="hw-withdraw-hint">' +
                escHtml(t('hideout_warehouse.hint.slot_locked')) + '</div>';
        }
        html += '</div>';

        detailEl.innerHTML = html;

        var btnAll = document.getElementById('hw-btn-withdraw-all');
        var btnOne = document.getElementById('hw-btn-withdraw-one');
        if (btnAll && !outpost && !locked) {
            btnAll.addEventListener('click', function () {
                handleWithdraw(slotIndex, null);
            });
        }
        if (btnOne && !outpost && !locked) {
            btnOne.addEventListener('click', function () {
                handleWithdraw(slotIndex, 1);
            });
        }
        var btnFill = document.getElementById('hw-btn-withdraw-fill');
        if (btnFill && !outpost && !locked) {
            btnFill.addEventListener('click', function () {
                handleWithdrawSaturated(slotIndex);
            });
        }
        var btnStar = document.getElementById('hw-btn-star');
        if (btnStar && pinQoL && HW.toggleSlotStarred) {
            btnStar.addEventListener('click', function () {
                HW.toggleSlotStarred(slotIndex);
                render();
            });
        }
        var btnLock = document.getElementById('hw-btn-lock');
        if (btnLock && pinQoL && HW.toggleSlotLocked) {
            btnLock.addEventListener('click', function () {
                HW.toggleSlotLocked(slotIndex);
                render();
            });
        }
    }

    function renderContainerStrip() {
        var stripEl = document.getElementById('hw-container-strip');
        if (!stripEl) return;

        var blocks = stripEl.querySelectorAll('.hw-container-block[data-container]');
        var b;
        for (b = 0; b < blocks.length; b++) {
            var block = blocks[b];
            var containerType = block.getAttribute('data-container');
            var slotsWrap = block.querySelector('.hw-container-slots');
            if (!slotsWrap || !containerType) continue;

            var arr = getContainerArray(containerType);
            slotsWrap.innerHTML = '';
            if (!arr || !arr.length) {
                var emptyMini = document.createElement('div');
                emptyMini.className = 'hw-mini-slot hw-mini-empty';
                emptyMini.textContent = t('hideout_warehouse.slot.empty');
                slotsWrap.appendChild(emptyMini);
                continue;
            }

            var shown = 0;
            var maxShow = arr.length;
            var i;
            for (i = 0; i < arr.length && shown < maxShow; i++) {
                var cell = arr[i];
                if (!cell || !cell.item_id) continue;
                var disp = resolveItemDisplay(cell.item_id, cell);
                var mini = document.createElement('button');
                mini.type='button';
                mini.className = 'hw-mini-slot';
                mini.setAttribute('data-container', containerType);
                mini.setAttribute('data-container-index', String(i));
                mini.textContent = disp.name + (disp.count > 1 ? ' ×' + disp.count : '');
                mini.title = '存入：'+disp.name + (disp.count > 1 ? ' ×' + disp.count : '');
                slotsWrap.appendChild(mini);
                shown += 1;
            }
            if (shown === 0) {
                var empty2 = document.createElement('div');
                empty2.className = 'hw-mini-slot hw-mini-empty';
                empty2.textContent = t('hideout_warehouse.slot.empty');
                slotsWrap.appendChild(empty2);
            }
        }
    }

    function buildUpgradeDescription(entry, upgradeId) {
        if (!entry) return '';
        if (entry.description) return String(entry.description);
        if (entry.capacity_after != null) {
            var HW = getHW();
            var before = HW && HW.getCapacity ? HW.getCapacity() : 100;
            if (isUpgradeCompletedLocal(HW, upgradeId)) {
                before = coerceCapacityBefore(entry.capacity_after, upgradeId);
            }
            return t('hideout_warehouse.upgrade.capacity_desc', {
                before: before,
                after: entry.capacity_after
            });
        }
        var descriptions={
            'U-C1':'改善格口与取用位置，支持双击仓内物品快速取出。',
            'U-B1':'整理货架与隔断，可以一键理仓。',
            'U-C2':'整理随身容器的卸货位置，便于批量存入物品。',
            'U-D1':'补齐仓内账册，方便记录储存物资。',
            'U-F1':'准备常备物品的收纳位置。',
            'U-F2':'整理工料存放区，让设施制作可以从仓库取料。',
            'U-E1':'准备封签与标记，可以锁定或标星仓内物品。',
            'U-G3':'完成冷藏设施，冷藏时停止仓内物品的腐败。',
            'U-C3':'整理取货通道，可以按随身容器的余量取出物品。',
            'U-F3':'增加常备物品的收纳方案。',
            'U-G1':'给仓内物品分栏，按类别查看。',
            'U-G2':'建立远途存放的接应条件。'
        };
        return descriptions[upgradeId]||'';
    }

    function coerceCapacityBefore(capacityAfter, upgradeId) {
        var cap = Math.floor(Number(capacityAfter) || 0);
        var ladder = [100, 200, 350, 500, 700];
        var i;
        for (i = 1; i < ladder.length; i++) {
            if (ladder[i] === cap) return ladder[i - 1];
        }
        return Math.max(100, cap - 100);
    }

    function isUpgradeCompletedLocal(HW, upgradeId) {
        if (!HW || !upgradeId) return false;
        return HW.getUpgradeStatus(upgradeId) === 'completed';
    }

    function getUpgradeStatusTag(status, entry) {
        if (status === 'completed') {
            return { cls: 'hw-upgrade-tag-done', text: '已完成' };
        }
        if (status === 'in_progress') {
            return { cls: 'hw-upgrade-tag-progress', text: isConstructionLive() ? '施工中' : '已暂停' };
        }
        if (status === 'materials') return {cls:'hw-upgrade-tag-lack',text:'待备料'};
        if (status === 'insufficient') {
            return { cls: 'hw-upgrade-tag-lack', text: '暂不能开工' };
        }
        if (status === 'locked') {
            return { cls: 'hw-upgrade-tag-locked', text: t('hideout_warehouse.upgrade.status.locked') };
        }
        return { cls: 'hw-upgrade-tag-tier', text: '可以开工' };
    }

    function getConstructionTickMs() {
        var HW = getHW();
        if (HW && typeof HW.getConstructionPanelTickMs === 'function') {
            var ms = HW.getConstructionPanelTickMs();
            if (isFinite(ms) && ms > 0) return ms;
        }
        return DEFAULT_CONSTRUCTION_TICK_MS;
    }

    function buildConstructionTickContext() {
        var Surv = global.Survival;
        return {
            getStamina: function () {
                if (!Surv || typeof Surv.getState !== 'function') return 0;
                return Number((Surv.getState() || {}).stamina) || 0;
            },
            setStamina: function (v) {
                if (!Surv || typeof Surv.setState !== 'function') return;
                var current = Surv.getStamina();
                if (v < current && Surv.consumeStamina) Surv.consumeStamina(current - v, {raw:true});
                else Surv.setState({ stamina: Number(v) || 0 });
            }
        };
    }

    function shouldRunConstructionTimer() {
        if (!constructionRequested || !panelOpen || !uiState.upgradeOverlayOpen || document.hidden) return false;
        var HW = getHW();
        if (!HW || typeof HW.getActiveUpgradeTask !== 'function') return false;
        return !!HW.getActiveUpgradeTask();
    }

    function isConstructionLive() {
        return constructionTimerId != null;
    }

    function stopConstructionTimer() {
        constructionRequested = false;
        if (constructionTimerId == null) return;
        global.clearInterval(constructionTimerId);
        constructionTimerId = null;
        renderConstructionCloseChrome();
    }

    function advanceConstructionTickOnce() {
        if (!shouldRunConstructionTimer()) {
            stopConstructionTimer();
            return;
        }
        var HW = getHW();
        if (!HW || typeof HW.tickConstructionTask !== 'function') {
            stopConstructionTimer();
            return;
        }
        if (global.Survival && global.Survival.isDead && global.Survival.isDead()) {stopConstructionTimer();projectMessage='当前无法继续施工。';render();return;}
        var result = HW.tickConstructionTask(buildConstructionTickContext());
        if (result && result.advanced && !saveConstruction()) {stopConstructionTimer();render();return;}
        if (result && result.advanced === false && result.reason === 'insufficient_stamina') {
            stopConstructionTimer();
            projectMessage='体力不足，你停下了手头的活。已完成的工程会保留。';
            showMsg(projectMessage, 'warn');
            refreshSceneAfterInventoryChange();
            render();
            return;
        }
        if (result && result.completed) {
            stopConstructionTimer();
            projectMessage='这项整备已经完成，可以使用了。';
            showMsg(projectMessage, 'success');
            refreshSceneAfterInventoryChange();
            render();
            return;
        }
        refreshSceneAfterInventoryChange();
        render();
    }

    function startConstructionTimer() {
        if (constructionTimerId != null) return;
        if (!shouldRunConstructionTimer()) return;
        constructionTimerId = global.setInterval(advanceConstructionTickOnce, getConstructionTickMs());
        renderConstructionCloseChrome();
    }

    function syncConstructionTimer() {
        if (shouldRunConstructionTimer()) startConstructionTimer();
        else stopConstructionTimer();
    }

    function isConstructionCloseBlocked() {
        return false;
    }

    function renderConstructionCloseChrome() {
        var blocked = isConstructionCloseBlocked();
        var closeBtn = document.getElementById('hw-close');
        var upgradeClose = document.getElementById('hw-upgrade-close');
        var buttons = [closeBtn, upgradeClose];
        var i;
        for (i = 0; i < buttons.length; i++) {
            var btn = buttons[i];
            if (!btn) continue;
            btn.disabled = blocked;
            btn.classList.toggle('hw-close-disabled', blocked);
            btn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
        }
    }

    function resolveRoutePickText(upgradeId, suffix) {
        var key = 'hideout_warehouse.upgrade.route.' + upgradeId + '.' + suffix;
        var text = t(key);
        return text === key ? '' : text;
    }

    function renderRoutePickOverlay(HW, listBody) {
        unmountMaterials();
        document.getElementById('hw-material-host').hidden=true;
        document.getElementById('hw-project-stages').textContent='';
        var starts = HW.getRouteStarts ? HW.getRouteStarts() : [];
        if (listBody) {
            listBody.innerHTML = '';
            var si;
            for (si = 0; si < starts.length; si++) {
                var rid = starts[si];
                var entry = HW.getUpgradeEntry ? HW.getUpgradeEntry(rid) : null;
                var card = document.createElement('button');
                card.type = 'button';
                card.className = 'hw-upgrade-card hw-route-pick-card';
                card.setAttribute('data-route-pick-id', rid);

                var tagEl = document.createElement('span');
                tagEl.className = 'hw-upgrade-tag hw-upgrade-tag-tier';
                tagEl.textContent = t('hideout_warehouse.upgrade.route_pick.tag');
                card.appendChild(tagEl);

                var routeTitle = resolveRoutePickText(rid, 'title');
                var nameEl = document.createElement('div');
                nameEl.className = 'hw-upgrade-card-name';
                nameEl.textContent = routeTitle || resolveUpgradeDisplayName(entry);
                card.appendChild(nameEl);

                var routeDesc = resolveRoutePickText(rid, 'desc');
                var descEl = document.createElement('p');
                descEl.className = 'hw-upgrade-card-desc';
                descEl.textContent = routeDesc || buildUpgradeDescription(entry, rid);
                card.appendChild(descEl);

                listBody.appendChild(card);
            }
        }

        var nameEl = document.getElementById('hw-upgrade-detail-name');
        var descEl = document.getElementById('hw-upgrade-detail-desc');
        var reqGrid = document.getElementById('hw-upgrade-req-grid');
        var progressTrack = document.getElementById('hw-upgrade-progress-track');
        var progressLabel = document.getElementById('hw-upgrade-progress-label');
        var deductEl = document.getElementById('hw-upgrade-deduct');
        var startBtn = document.getElementById('hw-btn-upgrade-start');

        if (nameEl) {nameEl.hidden=false;nameEl.textContent = t('hideout_warehouse.upgrade.route_pick.title');}
        if (descEl) descEl.textContent = t('hideout_warehouse.upgrade.route_pick.hint');
        if (reqGrid) reqGrid.innerHTML = '';
        if (progressTrack) progressTrack.classList.add('hw-hidden');
        if (progressLabel) progressLabel.classList.add('hw-hidden');
        if (deductEl) deductEl.textContent = '';
        if (startBtn) {
            startBtn.hidden=false;
            startBtn.disabled = true;
            startBtn.textContent = t('hideout_warehouse.upgrade.route_pick.choose_hint');
        }
    }

    function handleRoutePickClick(upgradeId) {
        var HW = getHW();
        if (!HW || typeof HW.pickInitialRoute !== 'function') return;
        var result = HW.pickInitialRoute(upgradeId);
        if (result && result.ok) {
            uiState.selectedUpgradeId = upgradeId;
            saveConstruction();
            showMsg(t('hideout_warehouse.log.route_picked'), 'success');
            renderUpgradeOverlay();
            render();
            return;
        }
        showMsg(t('hideout_warehouse.log.route_pick_fail'), 'warn');
    }

    function renderUpgradeOverlay() {
        var overlay = document.getElementById('hw-upgrade-overlay');
        if (!overlay || !uiState.upgradeOverlayOpen) return;

        var HW = getHW();
        if (!HW || typeof HW.listUpgradeIds !== 'function') return;

        var listBody = document.getElementById('hw-upgrade-list-body');
        if (HW.needsInitialRoutePick && HW.needsInitialRoutePick()) {
            renderRoutePickOverlay(HW, listBody);
            return;
        }

        var ids = HW.listVisibleUpgradeIds
            ? HW.listVisibleUpgradeIds()
            : HW.listUpgradeIds();
        if ((!uiState.selectedUpgradeId || ids.indexOf(uiState.selectedUpgradeId)<0) && ids.length) {
            var active = HW.getActiveUpgradeTask && HW.getActiveUpgradeTask();
            uiState.selectedUpgradeId = active && active.upgrade_id ? active.upgrade_id : ids[0];
        }

        if (listBody) {
            listBody.innerHTML = '';
            var i;
            for (i = 0; i < ids.length; i++) {
                var uid = ids[i];
                var entry = HW.getUpgradeEntry ? HW.getUpgradeEntry(uid) : null;
                var status = HW.getUpgradeStatus(uid);
                var tag = getUpgradeStatusTag(status, entry);
                var card = document.createElement('button');
                card.type = 'button';
                card.className = 'hw-upgrade-card'
                    + (uiState.selectedUpgradeId === uid ? ' selected' : '')
                    + (status === 'completed' ? ' done' : '')
                    + (status === 'in_progress' ? ' in-progress' : '')
                    + (status === 'locked' ? ' locked' : '');
                card.setAttribute('data-upgrade-id', uid);

                var tagEl = document.createElement('span');
                tagEl.className = 'hw-upgrade-tag ' + tag.cls;
                tagEl.textContent = tag.text;
                card.appendChild(tagEl);

                var nameEl = document.createElement('div');
                nameEl.className = 'hw-upgrade-card-name';
                nameEl.textContent = resolveUpgradeDisplayName(entry);
                card.appendChild(nameEl);

                var descEl = document.createElement('p');
                descEl.className = 'hw-upgrade-card-desc';
                descEl.textContent = buildUpgradeDescription(entry, uid);
                card.appendChild(descEl);

                listBody.appendChild(card);
            }
        }

        renderUpgradeDetail();
    }

    function saveConstruction() {
        try {if (!global.SaveSystem || global.SaveSystem.saveNow()) return true;} catch(e) {}
        projectMessage='保存失败，施工已暂停。当前进度仍在本次游戏中，请重试保存。';
        return false;
    }
    function unmountMaterials() {if(global.FacilityUnlockPanel)global.FacilityUnlockPanel.unmount();}
    function renderWorkspace() {
        var modal=document.getElementById('modal-hideout-warehouse');
        if(modal)modal.classList.toggle('hw-project-view',uiState.upgradeOverlayOpen);
        ['hw-btn-storage','hw-btn-upgrade'].forEach(function(id,i){var b=document.getElementById(id);if(b){b.classList.toggle('active',uiState.upgradeOverlayOpen===!!i);b.setAttribute('aria-pressed',String(uiState.upgradeOverlayOpen===!!i));}});
        var upgrade=document.getElementById('hw-btn-upgrade');if(upgrade)upgrade.hidden=isOutpostView();
        var hint=document.getElementById('hw-footer-hint');
        if(hint)hint.textContent=uiState.upgradeOverlayOpen?'已投入的材料与已完成的工程都会保留。':'点击下方随身物品存入；选择仓格后取出。';
    }
    function renderUpgradeDetail() {
        var HW=getHW(), uid=uiState.selectedUpgradeId, entry=uid&&HW.getUpgradeEntry(uid);
        var host=document.getElementById('hw-material-host'), start=document.getElementById('hw-btn-upgrade-start');
        if(!entry)return;
        var status=HW.getUpgradeStatus(uid), task=HW.getActiveUpgradeTask(), own=task&&task.upgrade_id===uid;
        document.getElementById('hw-upgrade-detail-name').textContent=status==='materials'?'':status==='completed'?'整备完成':own?(isConstructionLive()?'正在施工':'施工已暂停'):status==='locked'?'暂时无法施工':'材料已备齐';
        document.getElementById('hw-upgrade-detail-name').hidden=status==='materials';
        document.getElementById('hw-upgrade-detail-desc').textContent='';
        document.getElementById('hw-project-stages').textContent='';
        var stateText=status==='materials'?'先备好适合这项工程的材料，可以分次投入。':status==='completed'?'这项整备已经完成。':own?'工程已开始，做过的部分会保留。':status==='locked'?(task?'先完成手头的工程，再安排这一项。':entry.requires_story?'目前还缺少继续整备的条件。':'前面的整备尚未完成。'):'材料已经备好。点击「开始施工」后会持续消耗体力完成这项整备，随时可以暂停。';
        if(own){var ratio=1-task.ticks_remaining/Math.max(1,task.task_ticks_total);stateText=ratio===0?'材料已经摆好，工程刚刚起头。':ratio<.4?'基础部分正在整理，还有不少活要做。':ratio<.8?'主体已经有了样子，连接与细部还需要处理。':'主要工作已经完成，正在做最后的加固与检查。';}
        var req=document.getElementById('hw-upgrade-req-grid');req.hidden=status==='materials';req.textContent=stateText;
        if(status!=='completed'&&status!=='locked'&&status!=='materials'){
            var note=document.createElement('p');note.className='hw-work-cost';
            var per=own?task.stamina_per_tick:(entry.stamina_per_tick==null?5:entry.stamina_per_tick);
            var cost=global.Survival&&global.Survival.getActionStaminaCost?global.Survival.getActionStaminaCost(per):per;
            note.textContent='当前体力 '+Math.floor(Number(global.Survival&&global.Survival.getState().stamina)||0)+' · 每次施工消耗 '+cost+' 体力';req.appendChild(note);
        }
        var progress=document.getElementById('hw-upgrade-progress-label');progress.classList.remove('hw-hidden');progress.textContent=projectMessage||(own?(isConstructionLive()?'你正在整理材料、加固结构。':'施工已暂停，准备好后可以继续。'):'');
        document.getElementById('hw-upgrade-progress-track').classList.add('hw-hidden');
        document.getElementById('hw-upgrade-deduct').textContent=status==='materials'?'可使用随身和仓库中的材料；封签物品不会投入。':own?'暂停或离开都会保留工程，回来后手动继续。':'';
        var F=global.FacilityUnlockPanel, project='warehouse:'+uid;
        if(host){
            var mounted=F&&F.getEmbeddedProject();
            if(mounted&&mounted!==project){unmountMaterials();mounted=null;}
            if(status==='materials'&&F){host.hidden=false;if(!mounted)F.mount(host,project,function(){refreshSceneAfterInventoryChange();render();});}
            else if(mounted===project&&!own&&status!=='completed'&&host.querySelector('.cr-receipts')){host.hidden=false;}
            else {unmountMaterials();host.hidden=true;}
        }
        start.hidden=status==='materials';start.disabled=status==='completed'||status==='locked'||status==='insufficient';
        start.classList.toggle('hw-btn-disabled',start.disabled);
        start.textContent=own?(isConstructionLive()?'暂停施工':'继续施工'):status==='completed'?'已完成':status==='insufficient'?'体力尚不足，先休息一下':status==='locked'?'暂不能开工':'开始施工';
    }

    function openUpgradeOverlay() {
        if(isOutpostView())return;
        uiState.upgradeOverlayOpen = true;
        renderWorkspace();
        var overlay = document.getElementById('hw-upgrade-overlay');
        if (overlay) {
            overlay.classList.remove('hw-hidden');
            overlay.setAttribute('aria-hidden', 'false');
        }
        renderUpgradeOverlay();
        syncConstructionTimer();
    }

    function closeUpgradeOverlay(opts) {
        var options = opts || {};
        var wasLive = isConstructionLive();
        stopConstructionTimer();
        if(wasLive&&!saveConstruction()){render();return {ok:false,reason:'save_failed'};}
        unmountMaterials();
        uiState.upgradeOverlayOpen = false;
        renderWorkspace();
        var overlay = document.getElementById('hw-upgrade-overlay');
        if (overlay) {
            overlay.classList.add('hw-hidden');
            overlay.setAttribute('aria-hidden', 'true');
        }
        renderConstructionCloseChrome();
        if (options.notifyPause !== false && wasLive) {
            var HW = getHW();
            if (HW && typeof HW.getActiveUpgradeTask === 'function' && HW.getActiveUpgradeTask()) {
                showMsg(t('hideout_warehouse.log.upgrade_paused'), 'info');
            }
        }
        return { ok: true };
    }

    function handleUpgradeStart() {
        var HW=getHW(),uid=uiState.selectedUpgradeId;if(!HW||!uid)return;
        var task=HW.getActiveUpgradeTask();
        if(task&&task.upgrade_id===uid){
            if(isConstructionLive()){stopConstructionTimer();projectMessage='你放下手头的活，已完成的工程会保留。';saveConstruction();}
            else if(saveConstruction()){projectMessage='';constructionRequested=true;startConstructionTimer();}
        } else {
            var result=HW.startUpgrade(uid);
            if(result&&result.ok&&saveConstruction()){projectMessage='';constructionRequested=true;startConstructionTimer();}
            else if(!result||!result.ok)projectMessage='现在还不能开工，请检查材料、体力和前面的工程。';
        }
        refreshSceneAfterInventoryChange();render();
    }

    function handleUpgradeCardClick(upgradeId) {
        if(uiState.selectedUpgradeId!==upgradeId){stopConstructionTimer();unmountMaterials();projectMessage="";saveConstruction();}
        uiState.selectedUpgradeId = upgradeId;
        renderUpgradeOverlay();
        var detail=document.querySelector('#modal-hideout-warehouse .hw-upgrade-detail');if(detail)detail.scrollTop=0;
    }

    function renderTabRail() {
        var rail = document.getElementById('hw-tab-rail');
        if (!rail) return;
        var HW = getHW();
        var hasTabs = HW && HW.hasQoL && HW.hasQoL('qol_tab_view');
        var buttons = rail.querySelectorAll('.hw-cat-btn');
        var i;
        for (i = 0; i < buttons.length; i++) {
            var btn = buttons[i];
            var tab = btn.getAttribute('data-tab') || 'all';
            if (tab === 'all') {
                btn.classList.remove('hw-hidden');
                btn.classList.toggle('active', uiState.filterTab === 'all');
            } else if (!hasTabs) {
                btn.classList.add('hw-hidden');
                btn.classList.remove('active');
            } else {
                btn.classList.remove('hw-hidden');
                btn.classList.toggle('active', uiState.filterTab === tab);
            }
        }
    }

    function render() {
        var HW = getHW();
        if (!HW) return;

        var st = HW.getState();
        if (!st) return;

        var capacity = HW.getCapacity ? HW.getCapacity() : (st.capacity || 0);
        var used = HW.getUsedCount ? HW.getUsedCount() : 0;
        uiState.page = clampPage(uiState.page, capacity);

        if (uiState.selectedSlot != null && (!st.slots[uiState.selectedSlot] || !st.slots[uiState.selectedSlot].item_id)) {
            uiState.selectedSlot = null;
        }

        renderWorkspace();
        renderTabRail();
        renderHeaderBadges();
        renderQoLChrome();
        renderCapacity(used, capacity);
        renderSlotGrid(st.slots, capacity);
        renderDetail(uiState.selectedSlot);
        renderContainerStrip();
        if (uiState.upgradeOverlayOpen) renderUpgradeOverlay();
        renderConstructionCloseChrome();
        syncConstructionTimer();
    }

    function refreshSceneAfterInventoryChange() {
        if (global.SceneApp && typeof global.SceneApp.render === 'function') {
            try { global.SceneApp.render(); } catch (eR) { /* ignore */ }
        } else if (global.SceneRenderer && typeof global.SceneRenderer.render === 'function') {
            try { global.SceneRenderer.render(); } catch (eR2) { /* ignore */ }
        }
    }

    function handleSlotClick(slotIndex) {
        uiState.selectedSlot = slotIndex;
        render();
    }

    function handleWithdraw(slotIndex, count) {
        var HW = getHW();
        if (!HW || typeof HW.withdrawSlot !== 'function') return;

        var result = HW.withdrawSlot(slotIndex, count);
        if (result && result.ok) {
            showMsg(t('hideout_warehouse.log.withdraw_ok'), 'success');
            render();
            refreshSceneAfterInventoryChange();
            return;
        }
        if (result && result.reason === 'inventory_full') {
            showMsg(t('hideout_warehouse.log.inventory_full'), 'warn');
        } else if (result && result.reason === 'outpost_withdraw_blocked') {
            showMsg(t('hideout_warehouse.hint.withdraw_blocked'), 'warn');
        } else if (result && result.reason === 'slot_locked') {
            showMsg(t('hideout_warehouse.hint.slot_locked'), 'warn');
        } else if (result && result.reason) {
            showMsg(t('hideout_warehouse.log.withdraw_fail'), 'warn');
        }
        render();
    }

    function handleWithdrawSaturated(slotIndex) {
        var HW = getHW();
        if (!HW || typeof HW.withdrawSlotSaturated !== 'function') return;

        var result = HW.withdrawSlotSaturated(slotIndex);
        if (result && result.ok) {
            showMsg(t('hideout_warehouse.log.withdraw_fill_ok', {
                count: result.withdrawn != null ? result.withdrawn : 0
            }), 'success');
            render();
            refreshSceneAfterInventoryChange();
            return;
        }
        if (result && result.reason === 'outpost_withdraw_blocked') {
            showMsg(t('hideout_warehouse.hint.withdraw_blocked'), 'warn');
        } else if (result && result.reason === 'inventory_full') {
            showMsg(t('hideout_warehouse.log.inventory_full'), 'warn');
        }
        render();
    }

    function handleQuickTransferWarehouse(slotIndex) {
        var HW = getHW();
        if (!HW || !HW.hasQoL || !HW.hasQoL('qol_quick_transfer')) return;
        if (isOutpostView()) {
            showMsg(t('hideout_warehouse.hint.withdraw_blocked'), 'warn');
            return;
        }
        handleWithdraw(slotIndex, 1);
    }

    function handleQuickTransferContainer(containerType, index) {
        var HW = getHW();
        if (!HW || !HW.hasQoL || !HW.hasQoL('qol_quick_transfer')) return;
        if (typeof HW.depositOneFromContainer !== 'function') return;

        var result = HW.depositOneFromContainer(containerType, index);
        if (result && result.ok) {
            showMsg(t('hideout_warehouse.log.deposit_ok'), 'success');
            render();
            refreshSceneAfterInventoryChange();
            return;
        }
        if (result && result.reason === 'warehouse_full') {
            showMsg(t('hideout_warehouse.log.warehouse_full'), 'warn');
        }
        render();
    }

    function handleTidy() {
        var HW = getHW();
        if (!HW || typeof HW.tidySlots !== 'function') return;

        var result = HW.tidySlots();
        if (result && result.ok) {
            showMsg(t('hideout_warehouse.log.tidy_ok'), 'success');
            uiState.selectedSlot = null;
            render();
            return;
        }
        if (result && result.reason === 'qol_locked') {
            showMsg(t('hideout_warehouse.log.qol_locked'), 'warn');
        }
        render();
    }

    function handleSettingsToggle() {
        var HW = getHW();
        if (!HW || !HW.hasQoL || !HW.hasQoL('qol_craft_stash')) return;
        if (typeof HW.getPreferDeductWarehouse !== 'function'
            || typeof HW.setPreferDeductWarehouse !== 'function') return;

        var next = !HW.getPreferDeductWarehouse();
        HW.setPreferDeductWarehouse(next);
        showMsg(next
            ? t('hideout_warehouse.settings.prefer_warehouse_on')
            : t('hideout_warehouse.settings.prefer_warehouse_off'), 'info');
        render();
    }

    function handleDepositFromContainer(containerType, index) {
        var HW = getHW();
        if (!HW || typeof HW.depositFromContainer !== 'function') return;

        var result = HW.depositFromContainer(containerType, index);
        if (result && result.ok) {
            showMsg(t('hideout_warehouse.log.deposit_ok'), 'success');
            render();
            refreshSceneAfterInventoryChange();
            return;
        }
        if (result && result.reason === 'warehouse_full') {
            showMsg(t('hideout_warehouse.log.warehouse_full'), 'warn');
        } else if (result && result.reason === 'empty_cell') {
            return;
        }
        render();
    }

    function handleDepositAllFromContainer(containerType) {
        var arr = getContainerArray(containerType);
        if (!arr || !arr.length) return;

        var HW = getHW();
        if (!HW) return;

        var deposited = 0;
        var i;
        for (i = 0; i < arr.length; i++) {
            if (!arr[i] || !arr[i].item_id) continue;
            var result = HW.depositFromContainer(containerType, i);
            if (result && result.ok) {
                deposited += 1;
                continue;
            }
            if (result && result.reason === 'warehouse_full') break;
        }

        if (deposited > 0) {
            showMsg(t('hideout_warehouse.log.deposit_ok'), 'success');
            refreshSceneAfterInventoryChange();
        } else {
            var hadItem = false;
            for (i = 0; i < arr.length; i++) {
                if (arr[i] && arr[i].item_id) { hadItem = true; break; }
            }
            if (hadItem) showMsg(t('hideout_warehouse.log.warehouse_full'), 'warn');
        }
        render();
    }

    function bindOnce() {
        if (eventsBound) return;
        eventsBound = true;
        var warehouseModal=document.getElementById('modal-hideout-warehouse');
        if(warehouseModal)warehouseModal.addEventListener('keydown',function(e){
            if(!panelOpen)return;
            if(e.key==='Escape'){e.preventDefault();e.stopPropagation();document.getElementById('hw-close').click();}
            if(e.key==='Tab'){
                var controls=Array.from(warehouseModal.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')).filter(function(el){return el.getClientRects().length>0;});
                var first=controls[0],last=controls[controls.length-1];
                if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
                else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
            }
        });
        var storageBtn=document.getElementById('hw-btn-storage');if(storageBtn)storageBtn.addEventListener('click',function(){closeUpgradeOverlay();render();});
        document.addEventListener('visibilitychange',function(){if(document.hidden&&isConstructionLive()){stopConstructionTimer();projectMessage='你暂时停下了施工。';saveConstruction();render();}});


        var closeBtn = document.getElementById('hw-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function () {
                if (isConstructionCloseBlocked()) {
                    showMsg(t('hideout_warehouse.log.upgrade_close_blocked'), 'warn');
                    return;
                }
                if (global.SceneApp && typeof global.SceneApp.closeHideoutWarehousePanel === 'function') {
                    global.SceneApp.closeHideoutWarehousePanel();
                } else if (global.HideoutWarehousePanel && typeof global.HideoutWarehousePanel.close === 'function') {
                    global.HideoutWarehousePanel.close();
                }
            });
        }

        var prevBtn = document.getElementById('hw-pager-prev');
        var nextBtn = document.getElementById('hw-pager-next');
        if (prevBtn) {
            prevBtn.addEventListener('click', function () {
                if (uiState.page > 1) {
                    uiState.page -= 1;
                    render();
                }
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', function () {
                var HW = getHW();
                if (!HW) return;
                var cap = HW.getCapacity();
                if (uiState.page < getTotalPages(cap)) {
                    uiState.page += 1;
                    render();
                }
            });
        }

        var gridEl = document.getElementById('hw-slot-grid');
        if (gridEl) {
            gridEl.addEventListener('click', function (ev) {
                var target = ev.target;
                var cell = target && target.closest ? target.closest('.hw-slot-cell[data-slot-index]') : null;
                if (!cell) return;
                var idx = Math.floor(Number(cell.getAttribute('data-slot-index')));
                if (!isFinite(idx)) return;
                handleSlotClick(idx);
            });
            gridEl.addEventListener('dblclick', function (ev) {
                var cell = ev.target && ev.target.closest
                    ? ev.target.closest('.hw-slot-cell[data-slot-index]')
                    : null;
                if (!cell) return;
                ev.preventDefault();
                var idx = Math.floor(Number(cell.getAttribute('data-slot-index')));
                if (!isFinite(idx)) return;
                handleQuickTransferWarehouse(idx);
            });
        }

        var tabRail = document.getElementById('hw-tab-rail');
        if (tabRail) {
            tabRail.addEventListener('click', function (ev) {
                var btn = ev.target && ev.target.closest
                    ? ev.target.closest('.hw-cat-btn[data-tab]')
                    : null;
                if (!btn || btn.classList.contains('hw-hidden')) return;
                var tab = btn.getAttribute('data-tab') || 'all';
                uiState.filterTab = tab;
                uiState.page = 1;
                render();
            });
        }

        var tidyBtn = document.getElementById('hw-btn-tidy');
        if (tidyBtn) {
            tidyBtn.addEventListener('click', function () {
                handleTidy();
            });
        }

        var settingsBtn = document.getElementById('hw-btn-settings');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', function () {
                handleSettingsToggle();
            });
        }

        var upgradeBtn = document.getElementById('hw-btn-upgrade');
        if (upgradeBtn) {
            upgradeBtn.addEventListener('click', function () {
                openUpgradeOverlay();
            });
        }

        var upgradeClose = document.getElementById('hw-upgrade-close');
        if (upgradeClose) {
            upgradeClose.addEventListener('click', function () {
                closeUpgradeOverlay();
            });
        }

        var upgradeStart = document.getElementById('hw-btn-upgrade-start');
        if (upgradeStart) {
            upgradeStart.addEventListener('click', function () {
                handleUpgradeStart();
            });
        }

        var upgradeList = document.getElementById('hw-upgrade-list-body');
        if (upgradeList) {
            upgradeList.addEventListener('click', function (ev) {
                var routeCard = ev.target && ev.target.closest
                    ? ev.target.closest('.hw-route-pick-card[data-route-pick-id]')
                    : null;
                if (routeCard) {
                    handleRoutePickClick(routeCard.getAttribute('data-route-pick-id'));
                    return;
                }
                var card = ev.target && ev.target.closest
                    ? ev.target.closest('.hw-upgrade-card[data-upgrade-id]')
                    : null;
                if (!card) return;
                handleUpgradeCardClick(card.getAttribute('data-upgrade-id'));
            });
        }

        var stripEl = document.getElementById('hw-container-strip');
        if (stripEl) {
            stripEl.addEventListener('click', function (ev) {
                var mini = ev.target && ev.target.closest
                    ? ev.target.closest('.hw-mini-slot[data-container][data-container-index]')
                    : null;
                if (mini) {
                    var ct = mini.getAttribute('data-container');
                    var ci = Math.floor(Number(mini.getAttribute('data-container-index')));
                    if (ct && isFinite(ci)) handleDepositFromContainer(ct, ci);
                    return;
                }
                var depositAllBtn = ev.target && ev.target.closest
                    ? ev.target.closest('.hw-container-deposit[data-container]')
                    : null;
                if (depositAllBtn) {
                    var ct2 = depositAllBtn.getAttribute('data-container');
                    if (ct2) handleDepositAllFromContainer(ct2);
                }
            });

        }
    }

    function open() {
        bindOnce();
        panelOpen = true;
        var modal = document.getElementById('modal-hideout-warehouse');
        if (modal) {
            modal.classList.add('show');
            modal.setAttribute('aria-hidden', 'false');
        }
        render();
    }

    function close() {
        if (!panelOpen) return { ok: false, reason: 'not_open' };
        var HW = getHW();
        if(!saveConstruction()){stopConstructionTimer();render();return {ok:false,reason:"save_failed"};}
        var hadTask = HW && typeof HW.getActiveUpgradeTask === 'function' && HW.getActiveUpgradeTask();
        stopConstructionTimer();
        panelOpen = false;
        closeUpgradeOverlay({ notifyPause: false });
        if (hadTask) {
            showMsg(t('hideout_warehouse.log.upgrade_paused'), 'info');
        }
        var modal = document.getElementById('modal-hideout-warehouse');
        if (modal) {
            modal.classList.remove('show');
            modal.setAttribute('aria-hidden', 'true');
        }
        renderConstructionCloseChrome();
        return { ok: true };
    }

    function isOpen() {
        return panelOpen;
    }

    global.HideoutWarehousePanel = {
        suspendForLoad: function(){stopConstructionTimer();unmountMaterials();uiState.selectedUpgradeId=null;uiState.upgradeOverlayOpen=false;projectMessage='';var el=document.getElementById('hw-upgrade-overlay');if(el){el.classList.add('hw-hidden');el.setAttribute('aria-hidden','true');}renderWorkspace();},
        open: open,
        close: close,
        isOpen: isOpen,
        render: render,
        bindOnce: bindOnce,
        openUpgradeOverlay: openUpgradeOverlay,
        closeUpgradeOverlay: closeUpgradeOverlay,
        isConstructionLive: isConstructionLive,
        syncConstructionTimer: syncConstructionTimer,
        getUiState: function () {
            return {
                page: uiState.page,
                pageSize: uiState.pageSize,
                selectedSlot: uiState.selectedSlot,
                filterTab: uiState.filterTab,
                upgradeOverlayOpen: uiState.upgradeOverlayOpen,
                selectedUpgradeId: uiState.selectedUpgradeId
            };
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
