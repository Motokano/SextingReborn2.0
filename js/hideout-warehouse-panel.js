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
            var maxShow = containerType === 'backpack' ? 12 : (containerType === 'vest' ? 8 : 6);
            var i;
            for (i = 0; i < arr.length && shown < maxShow; i++) {
                var cell = arr[i];
                if (!cell || !cell.item_id) continue;
                var disp = resolveItemDisplay(cell.item_id, cell);
                var mini = document.createElement('div');
                mini.className = 'hw-mini-slot';
                mini.setAttribute('data-container', containerType);
                mini.setAttribute('data-container-index', String(i));
                mini.textContent = abbreviateLabel(disp.name, 3) + (disp.count > 1 ? '×' + disp.count : '');
                mini.title = disp.name + (disp.count > 1 ? ' ×' + disp.count : '');
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
        return '';
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
            return { cls: 'hw-upgrade-tag-done', text: t('hideout_warehouse.upgrade.status.done') };
        }
        if (status === 'in_progress') {
            return { cls: 'hw-upgrade-tag-progress', text: t('hideout_warehouse.upgrade.status.in_progress') };
        }
        if (status === 'insufficient') {
            return { cls: 'hw-upgrade-tag-lack', text: t('hideout_warehouse.upgrade.status.insufficient') };
        }
        if (status === 'locked') {
            return { cls: 'hw-upgrade-tag-locked', text: t('hideout_warehouse.upgrade.status.locked') };
        }
        var drive = entry && entry.drive ? String(entry.drive) : 'S';
        var driveKey = 'hideout_warehouse.upgrade.drive.' + drive;
        var driveText = t(driveKey);
        if (driveText === driveKey) driveText = t('hideout_warehouse.upgrade.status.available');
        return { cls: 'hw-upgrade-tag-tier', text: driveText };
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
                Surv.setState({ stamina: Number(v) || 0 });
            }
        };
    }

    function shouldRunConstructionTimer() {
        if (!panelOpen || !uiState.upgradeOverlayOpen) return false;
        var HW = getHW();
        if (!HW || typeof HW.getActiveUpgradeTask !== 'function') return false;
        return !!HW.getActiveUpgradeTask();
    }

    function isConstructionLive() {
        return constructionTimerId != null;
    }

    function stopConstructionTimer() {
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
        var result = HW.tickConstructionTask(buildConstructionTickContext());
        if (result && result.advanced === false && result.reason === 'insufficient_stamina') {
            stopConstructionTimer();
            showMsg(t('hideout_warehouse.log.upgrade_stamina_pause'), 'warn');
            refreshSceneAfterInventoryChange();
            render();
            return;
        }
        if (result && result.completed) {
            stopConstructionTimer();
            showMsg(t('hideout_warehouse.log.upgrade_completed'), 'success');
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
        return isConstructionLive();
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
        var starts = HW.getRouteStarts ? HW.getRouteStarts() : [];
        if (listBody) {
            listBody.innerHTML = '';
            var si;
            for (si = 0; si < starts.length; si++) {
                var rid = starts[si];
                var entry = HW.getUpgradeEntry ? HW.getUpgradeEntry(rid) : null;
                var card = document.createElement('div');
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

        if (nameEl) nameEl.textContent = t('hideout_warehouse.upgrade.route_pick.title');
        if (descEl) descEl.textContent = t('hideout_warehouse.upgrade.route_pick.hint');
        if (reqGrid) reqGrid.innerHTML = '';
        if (progressTrack) progressTrack.classList.add('hw-hidden');
        if (progressLabel) progressLabel.classList.add('hw-hidden');
        if (deductEl) deductEl.textContent = '';
        if (startBtn) {
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
        if (!uiState.selectedUpgradeId && ids.length) {
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
                var card = document.createElement('div');
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

    function renderUpgradeDetail() {
        var HW = getHW();
        var nameEl = document.getElementById('hw-upgrade-detail-name');
        var descEl = document.getElementById('hw-upgrade-detail-desc');
        var reqGrid = document.getElementById('hw-upgrade-req-grid');
        var progressTrack = document.getElementById('hw-upgrade-progress-track');
        var progressFill = document.getElementById('hw-upgrade-progress-fill');
        var progressLabel = document.getElementById('hw-upgrade-progress-label');
        var deductEl = document.getElementById('hw-upgrade-deduct');
        var startBtn = document.getElementById('hw-btn-upgrade-start');

        if (!HW || !uiState.selectedUpgradeId) {
            if (nameEl) nameEl.textContent = '';
            if (descEl) descEl.textContent = t('hideout_warehouse.upgrade.select_hint');
            if (reqGrid) reqGrid.innerHTML = '';
            if (progressTrack) progressTrack.classList.add('hw-hidden');
            if (progressLabel) progressLabel.classList.add('hw-hidden');
            if (startBtn) startBtn.disabled = true;
            return;
        }

        var upgradeId = uiState.selectedUpgradeId;
        var entry = HW.getUpgradeEntry(upgradeId);
        var status = HW.getUpgradeStatus(upgradeId);
        var active = HW.getActiveUpgradeTask ? HW.getActiveUpgradeTask() : null;
        var inProgress = status === 'in_progress' && active && active.upgrade_id === upgradeId;

        if (nameEl) nameEl.textContent = resolveUpgradeDisplayName(entry);
        if (descEl) descEl.textContent = buildUpgradeDescription(entry, upgradeId);

        if (reqGrid) {
            reqGrid.innerHTML = '';
            var inputs = entry && Array.isArray(entry.inputs) ? entry.inputs : [];
            var ri;
            for (ri = 0; ri < inputs.length; ri++) {
                var inp = inputs[ri];
                if (!inp || !inp.item_id) continue;
                var need = Math.max(1, Math.floor(Number(inp.count) || 1));
                var have = HW.countItemEverywhere ? HW.countItemEverywhere(inp.item_id) : HW.countItem(inp.item_id);
                var tpl = getItemTemplate(inp.item_id);
                var label = resolveItemLabel(inp.item_id, tpl);

                var row = document.createElement('div');
                row.className = 'hw-upgrade-req-item';
                var spanName = document.createElement('span');
                spanName.textContent = label;
                var spanVal = document.createElement('span');
                spanVal.className = 'hw-upgrade-req-val' + (have < need ? ' insufficient' : '');
                spanVal.textContent = String(have) + ' / ' + String(need);
                row.appendChild(spanName);
                row.appendChild(spanVal);
                reqGrid.appendChild(row);
            }

            var taskSpec = entry && HW.getUpgradeEntry
                ? (function () {
                    var defaults = { task_ticks: 10, stamina_per_tick: 5 };
                    return {
                        task_ticks: entry.task_ticks != null ? entry.task_ticks : defaults.task_ticks,
                        stamina_per_tick: entry.stamina_per_tick != null ? entry.stamina_per_tick : defaults.stamina_per_tick
                    };
                })()
                : { task_ticks: 10, stamina_per_tick: 5 };

            var tickRow = document.createElement('div');
            tickRow.className = 'hw-upgrade-req-item';
            var tickLabel = document.createElement('span');
            tickLabel.textContent = t('hideout_warehouse.upgrade.task_ticks');
            var tickVal = document.createElement('span');
            tickVal.className = 'hw-upgrade-req-val';
            tickVal.textContent = t('hideout_warehouse.upgrade.task_ticks_val', {
                ticks: taskSpec.task_ticks,
                stamina: taskSpec.stamina_per_tick,
                seconds: Math.round(getConstructionTickMs() / 1000)
            });
            tickRow.appendChild(tickLabel);
            tickRow.appendChild(tickVal);
            reqGrid.appendChild(tickRow);
        }

        var showProgress = inProgress && active;
        if (progressTrack) progressTrack.classList.toggle('hw-hidden', !showProgress);
        if (progressLabel) progressLabel.classList.toggle('hw-hidden', !showProgress);
        if (showProgress && progressFill && progressLabel) {
            var total = Math.max(1, Math.floor(Number(active.task_ticks_total) || 1));
            var remaining = Math.max(0, Math.floor(Number(active.ticks_remaining) || 0));
            var done = total - remaining;
            progressFill.style.width = String(Math.round((done / total) * 100)) + '%';
            progressLabel.textContent = t('hideout_warehouse.upgrade.progress_remaining', {
                remaining: remaining,
                total: total
            });
        }

        var st = HW.getState();
        var prefer = st && st.settings && st.settings.prefer_deduct_warehouse;
        if (deductEl) {
            deductEl.textContent = prefer
                ? t('hideout_warehouse.upgrade.deduct_prefer_warehouse')
                : t('hideout_warehouse.upgrade.deduct_default');
        }

        if (startBtn) {
            var canStart = status === 'available';
            startBtn.disabled = !canStart;
            startBtn.classList.toggle('hw-btn-disabled', !canStart);
            if (inProgress) {
                startBtn.textContent = t('hideout_warehouse.upgrade.status.in_progress');
            } else if (status === 'completed') {
                startBtn.textContent = t('hideout_warehouse.upgrade.status.done');
            } else {
                startBtn.textContent = t('hideout_warehouse.upgrade.start');
            }
        }
    }

    function openUpgradeOverlay() {
        uiState.upgradeOverlayOpen = true;
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
        if (isConstructionLive() && options.force !== true) {
            showMsg(t('hideout_warehouse.log.upgrade_close_blocked'), 'warn');
            return { ok: false, reason: 'construction_live' };
        }
        var wasLive = isConstructionLive();
        stopConstructionTimer();
        uiState.upgradeOverlayOpen = false;
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
        var HW = getHW();
        if (!HW || !uiState.selectedUpgradeId || typeof HW.startUpgrade !== 'function') return;

        var result = HW.startUpgrade(uiState.selectedUpgradeId);
        if (result && result.ok) {
            showMsg(t('hideout_warehouse.log.upgrade_started'), 'success');
            refreshSceneAfterInventoryChange();
            render();
            syncConstructionTimer();
            return;
        }
        if (result && result.reason === 'task_busy') {
            showMsg(t('hideout_warehouse.log.upgrade_busy'), 'warn');
        } else if (result && (result.reason === 'insufficient_items' || result.reason === 'insufficient_stamina')) {
            showMsg(t('hideout_warehouse.log.upgrade_insufficient'), 'warn');
        }
        renderUpgradeOverlay();
    }

    function handleUpgradeCardClick(upgradeId) {
        uiState.selectedUpgradeId = upgradeId;
        renderUpgradeOverlay();
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
            stripEl.addEventListener('dblclick', function (ev) {
                var mini = ev.target && ev.target.closest
                    ? ev.target.closest('.hw-mini-slot[data-container][data-container-index]')
                    : null;
                if (!mini) return;
                ev.preventDefault();
                var ct = mini.getAttribute('data-container');
                var ci = Math.floor(Number(mini.getAttribute('data-container-index')));
                if (ct && isFinite(ci)) handleQuickTransferContainer(ct, ci);
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
        if (isConstructionLive()) {
            showMsg(t('hideout_warehouse.log.upgrade_close_blocked'), 'warn');
            return { ok: false, reason: 'construction_live' };
        }
        var HW = getHW();
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
