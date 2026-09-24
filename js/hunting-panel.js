(function (global) {
    'use strict';
    var H, C, overlay, card, actionRoot, kitsOpen = false;
    function t(key, vars) { return global.UIText.t(key, vars); }
    function node(tag, text, parent) { var el = document.createElement(tag); if (text != null) el.textContent = text; if (parent) parent.appendChild(el); return el; }
    function inv() { return global.InventoryEquipment; }
    function arrays() { return ['pocket','vest','backpack'].map(function (type) { return { type: type, cells: global.InventoryHelpers.getInventoryContainerArray(type) || [] }; }); }
    function count(id) { var n = 0; arrays().forEach(function (a) { a.cells.forEach(function (c) { if (c && c.item_id === id) n += c.count || 1; }); }); return n; }
    function consume(id, n) {
        if (count(id) < n) return false;
        while (n-- > 0) {
            var slot = global.InventoryHelpers.findFirstContainerSlotByItemId(id);
            if (!slot || !inv().takeItemFromContainer(slot.containerType, slot.index).success) throw new Error('Hunting inventory changed during synchronous transaction');
        }
        return true;
    }
    function currentPoint() {
        var E = global.GameEngine, st = E && E.getState();
        var rec = st && E.getEntityRecordAt(st.x, st.y);
        return rec && rec.entity_id === 'hunting_point' ? { key: st.mapId + ':' + rec.hunting_point_id, pool: rec.hunting_events || ['rabbit'] } : null;
    }
    function alive() { var s = global.Survival.getState(); return !s.isDead && !s.isComa && !(global.BuffSystem && global.BuffSystem.hasBuff && global.BuffSystem.hasBuff('player', 'survival_coma')); }
    function inCombat() { return global.CombatEngagement && global.CombatEngagement.isPlayerInCombat(); }
    function grant(item) {
        var dropped = false;
        // Vest/pocket placement accepts one unit; issue individually to avoid truncating stacks.
        for (var i=0;i<(item.count || 1);i++) {
            var unit = Object.assign({},item,{count:1});
            var placed = inv().putItemIntoDefaultContainer(unit);
            if (!placed || !placed.placed) {
                var st = global.GameEngine.getState();
                inv().addItemToGround(st.mapId, st.x, st.y, unit); dropped = true;
            }
        }
        if (dropped) global.GameLog.log(t('hunting.ground'), 'info');
    }
    function name(id) { var tpl = inv().getItemTemplate(id); return tpl ? (tpl.name || tpl.name_0 || tpl.sn || id) : id; }
    function refreshAll() {
        render();
        if (global.SceneApp) global.SceneApp.render();
        if (global.SceneHud) global.SceneHud.refresh('status');
        if (global.SaveSystem) global.SaveSystem.saveNow();
    }
    function tick(rest) {
        var S = global.Survival, previous = S.getState().isResting;
        S.setResting(rest);
        try { S.advanceTick(); } finally { S.setResting(previous); }
    }
    function configure(config) {
        H = global.Hunting; C = config;
        H.configure(C, {
            now: function () { return global.GameTime.getState().totalTicks; },
            canStart: function (key) {
                var p = currentPoint(), app = global.SceneApp;
                return !!(p && p.key === key && alive() && !inCombat() && app && !app.isPreCreationGameplayRestricted() && !app.isPlayerActionDisabledByBuff('gather') &&
                    !(global.SceneCtx && global.SceneCtx.idleActionType) && !global.Survival.getState().isResting);
            },
            canContinue: function (key) { var p = currentPoint(); return !!(p && p.key === key && alive() && !inCombat()); },
            stamina: function () { return global.Survival.getStamina(); },
            canSpend: function () { return global.Survival.canPerformStaminaOrEnergyAction() && !global.SceneApp.isPlayerActionDisabledByBuff('gather'); },
            count: count, consume: consume, grant: grant, tick: tick,
            spend: function (n) { global.Survival.consumeStamina(n); },
            level: function(){var s=inv().getState();return s.skills && s.skills.life_hunting ? s.skills.life_hunting.level || 1 : 1;},
            addProficiency:function(n){
                var s=inv().getState();s.skills=s.skills||{};
                var entry=s.skills.life_hunting || (s.skills.life_hunting={level:1,move_usage:{}});entry.level=Math.max(1,entry.level||0);
                var total=inv().incrementSkillMoveUsage('life_hunting','hunting_action',n);
                entry.level=Math.max(entry.level,Math.min(C.learning.max_level,1+Math.floor(total/C.learning.uses_per_level)));
            },
            makeJuvenile: function (species) { return { species: species, gender: species === 'chicken' ? 'female' : (Math.random() < 0.5 ? 'male' : 'female'), perks: global.LivestockState.rollPerks(species) }; },
            changed: refreshAll
        });
    }
    function init() {
        if (overlay) return;
        overlay = node('div', null, document.body); overlay.id = 'hunting-overlay'; overlay.hidden = true;
        card = node('section', null, overlay); card.className = 'hunting-card'; card.setAttribute('role','dialog'); card.setAttribute('aria-modal','true'); card.setAttribute('aria-label',t('hunting.title'));
        card.tabIndex = -1;
        document.addEventListener('keydown', function (e) {
            if (!overlay || overlay.hidden) return;
            if (e.key === 'Tab') {
                var buttons = card.querySelectorAll('button:not(:disabled)'), first = buttons[0], last = buttons[buttons.length - 1];
                if (buttons.length && (!card.contains(document.activeElement) || document.activeElement === card || (e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last))) {
                    e.preventDefault(); (e.shiftKey ? last : first).focus();
                }
                e.stopImmediatePropagation(); return;
            }
            if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && card.contains(document.activeElement) && document.activeElement.tagName === 'BUTTON') { e.stopImmediatePropagation(); return; }
            e.preventDefault(); e.stopImmediatePropagation();
        }, true);
    }
    function button(label, handler, disabled, explanation) {
        var wrap = node('div', null, actionRoot || card); wrap.className = 'hunting-choice';
        var b = node('button', label, wrap); b.disabled = !!disabled; b.onclick = handler;
        if (explanation) node('small', explanation, wrap);
        return b;
    }
    function message(key) { global.GameLog.log(t('hunting.reason.' + key), 'warn'); }
    function open() {
        if (!H || !H.ready()) return;
        if (H.isActive()) { render(); return; }
        var p = currentPoint(); if (!p) return;
        var r = H.start(p.key, p.pool); if (!r.ok) message(r.reason);
        else { render(); card.focus(); }
    }
    function action(id) { var r = H.act(id); if (!r.ok) message(r.reason); }
    function actionCard(parent,id) {
        var cfg=H.getAction(id), why=H.reason(id), done=why==='done', p=H.chance(id);
        var b=node('button',null,parent);b.className='hunt-action-card'+(done?' is-done':'');
        b.disabled=!!why;b.onclick=function(){action(id);};
        var top=node('span',null,b);top.className='hunt-action-top';
        var icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
        icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');top.appendChild(icon);
        var paths={observe:'M2 12Q12-2 22 12Q12 26 2 12ZM15 12a3 3 0 1 0-6 0a3 3 0 1 0 6 0',block:'M4 5L20 19M4 19L20 5M3 3L7 3M17 21L21 21',bait:'M7 9L17 9L11 22ZM12 9L8 2M12 9L17 2',hands:'M5 14V10Q5 7 7 10V5Q7 2 9 5V3Q10 0 12 3V5Q14 2 15 5V8Q18 6 18 9V15Q17 21 12 21Q7 21 5 14Z',net:'M3 3H17V15H3ZM3 3L17 15M17 3L3 15M10 3V15M3 9H17M17 15L22 22',snare:'M19 12a8 6 0 1 0-16 0a8 6 0 1 0 16 0M19 12L22 2M20 2H24',javelin:'M3 21L17 7M14 8L21 2L20 10Z'};
        var partPaths={process_blood:'M12 2Q2 13 5 18Q12 25 19 18Q22 13 12 2Z',process_skin:'M5 3L10 6H14L19 3L22 8L18 11V18L15 22H9L6 18V11L2 8Z',process_bone:'M7 5Q2 0 2 6Q0 10 6 9L15 18Q14 24 19 22Q25 24 23 18Q24 13 18 15Z',process_special:'M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9Z'};
        var reactionPaths={hide:'M3 20V9L12 2L21 9V20H3ZM9 20V12H15V20',counter:paths.javelin,air_javelin:paths.javelin,wait_land:paths.observe,retreat:'M14 4H21V20H14M16 12H2M7 7L2 12L7 17'};
        var path=document.createElementNS(icon.namespaceURI,'path');path.setAttribute('d',paths[id.replace('retry_','')] || partPaths[id] || reactionPaths[id] || paths.snare);icon.appendChild(path);
        var odds=node('span',done?'✓':p!=null && H.knows('animal_regular_path')?t(p<.35?'hunting.odds.low':p<.65?'hunting.odds.some':'hunting.odds.good'):'',top);odds.className='hunt-action-odds';
        var active=H.getState().active;
        var label=id==='bait' && C.events[active.event].counterattack && active.target==='juvenile' ? 'lure_mother' : id;
        if(id==='bait' && C.events[active.event].startles && active.target==='juvenile')label='lure_hen';
        if(id==='bait' && C.events[active.event].herd)label='separate_sheep';
        if(id==='bait' && C.events[active.event].strength)label=active.target==='juvenile'?'lure_cow':'separate_cattle';
        if(!H.knows('animal_regular_path')){if(id==='bait')label='try_food';if(id==='hands')label='try_grab';if(id==='javelin')label='try_throw';}
        node('span',t('hunting.action.'+label),b).className='hunt-action-name';
        if(cfg.reward)node('span',name(cfg.reward)+' ×'+cfg.count,b).className='hunt-action-item';
        node('span',done?t('hunting.done'):t('hunting.cost',{n:cfg.stamina})+' · '+t('hunting.action_time',{n:cfg.ticks}),b).className='hunt-action-cost';
        if(cfg.item&&!done)node('span',t('hunting.item_short',{name:name(cfg.item),n:count(cfg.item)}),b).className='hunt-action-item';
        if(why&&!done&&why!=='item')node('span',t('hunting.reason.'+why),b).className='hunt-action-reason';
    }
    function actionGroup(key,ids) {
        ids=ids.filter(function(id){return H.visible(id);});if(!ids.length)return;
        node('h3',t('hunting.group.'+key),actionRoot).className='hunt-group-title';
        var grid=node('div',null,actionRoot);grid.className='hunt-action-grid hunt-grid-'+key;
        ids.forEach(function(id){actionCard(grid,id);});
    }
    function render() {
        if (!H || !C || !global.UIText) return;
        init();
        var a = H.getState().active, app = global.SceneApp;
        var base = global.GameEngine && /Base|^home$/.test(global.GameEngine.getState().mapId);
        if(kitsOpen&&!canOpenCrafting())kitsOpen=false;
        overlay.hidden = !a && !kitsOpen;
        if (overlay.hidden) return;
        card.replaceChildren();
        actionRoot = null;
        card.classList.toggle('hunting-card-active',!!a);
        if (!a) { renderKits(); return; }
        var event = C.events[a.event], s = global.Survival.getState();
        node('h2',t(event.title),card);
        var variant=H.getVariant();
        node('p',variant.title?t(variant.title):t(event.intro),card);
        node('p',t('hunting.stats',{stamina:Math.round(s.stamina*10)/10,satiety:Math.round(s.satiety*10)/10,thirst:Math.round(s.thirst*10)/10}),card).className = 'hunting-stats';
        var layout = node('div',null,card); layout.className = 'hunting-layout';
        global.HuntingScene.render(layout,a,event,C);
        if (H.knows('field_processing') && a.target === 'meat' && a.phase !== 'ended' && a.phase !== 'processing') node('span',t('hunting.yield',{n:event.reward_count || 1}),layout.querySelector('.hunting-scene')).className='hunt-yield';
        actionRoot = node('div',null,layout); actionRoot.className = 'hunting-actions';
        if (a.last !== 'hunting.started') node('p',t(a.last),actionRoot).setAttribute('role','status');
        if(a.lastXp)node('small',t('hunting.proficiency',{n:a.lastXp}),actionRoot);
        var known=H.getState().knowledge || {};
        var notes=Object.keys(known);
        if(notes.length){var details=node('details',null,actionRoot);node('summary',t('hunting.notes'),details);notes.forEach(function(id){node('p',t('hunting.note.'+id+'.'+(known[id].stage==='understood'?'known':'clue')),details);});}
        if(a.phase==='survey'){
            var searches=['inspect_gap','inspect_rope','probe_rope','practice_knot','inspect_trap'].filter(function(id){return H.reason(id)!=='phase';});
            actionGroup('survey',searches);button(t('hunting.close'),function(){action('close');});return;
        }
        if (a.phase === 'ended') {
            if (a.reward) node('p',t('hunting.reward',{name:name(a.reward.item_id),n:a.reward.count || 1}),actionRoot);
            (a.extraRewards || []).forEach(function(r){node('p',t('hunting.reward',{name:name(r.item_id),n:r.count}),actionRoot);});
            node('p',t('hunting.cooldown',{n:C.cooldown_ticks}),actionRoot);
            button(t('hunting.close'),function () { action('close'); }); return;
        }
        if (!a.target) {
            button(t('hunting.target.meat'),function () { action('meat'); });
            button(t('hunting.target.juvenile'),function () { action('juvenile'); });
        } else {
            if(a.phase==='prepare') {
                actionGroup('notice',['look']);
                actionGroup('prepare',event.strength?(a.target==='meat'?['observe','bait','set_tether']:['observe','bait']):event.herd?['observe','bait','set_intercept']:event.counterattack || event.startles?['observe','bait']:['observe','block','bait']);
                actionGroup('capture',event.herd || event.strength?['hands','net','javelin']:['hands','net','snare','javelin']);
            } else if(a.phase==='retry')actionGroup('retry',['retry_hands','retry_net']);
            else if(a.phase==='charge') {
                actionGroup('charge',a.target==='juvenile'?['hide','retreat']:['hide','counter','retreat']);
                return;
            }
            else if(a.phase==='straining') {
                actionGroup('straining',['brace']);
                button(t('hunting.abandon'),function(){action('abandon');}).classList.add('hunt-abandon');
                return;
            }
            else if(a.phase==='herd_alert') {
                actionGroup('herd_alert',['intercept']);
                button(t('hunting.abandon'),function(){action('abandon');}).classList.add('hunt-abandon');
                return;
            }
            else if(a.phase==='airborne') {
                actionGroup('airborne',['air_javelin','wait_land']);
                button(t('hunting.abandon'),function(){action('abandon');}).classList.add('hunt-abandon');
                return;
            }
            else if(a.phase==='processing') {
                node('p',t('hunting.reward',{name:name(a.reward.item_id),n:a.reward.count}),actionRoot);
                actionGroup('survey',['inspect_carcass']);
                actionGroup('processing',Object.keys(event.processing).map(function(k){return 'process_'+k;}));
            }
            var restKey = a.phase === 'processing' ? 'hunting.rest.processing' : a.phase === 'waiting' ? 'hunting.rest.wait' : a.phase === 'retry' ? 'hunting.rest.escape' : 'hunting.rest.risk';
            var restReason = H.reason('rest');
            button(t('hunting.rest'),function () { action('rest'); },!!restReason,t(restKey,{n:C.rest_ticks}));
        }
        if(a.phase==='processing')button(t('hunting.leave'),function(){action('leave');});
        else button(t('hunting.abandon'),function () { action('abandon'); }).classList.add('hunt-abandon');
    }
    function canOpenCrafting() {
        var app=global.SceneApp, E=global.GameEngine;
        return !!(H&&C&&E&&/Base|^home$/.test(E.getState().mapId)&&!H.isActive()&&alive()&&!inCombat()&&app&&!app.isPreCreationGameplayRestricted()&&
            !(app.isPlayerActionDisabledByBuff&&app.isPlayerActionDisabledByBuff('craft'))&&!(global.FishingPanel&&global.FishingPanel.isOpen())&&!(global.SceneCtx&&global.SceneCtx.idleActionType));
    }
    function openCrafting(){if(!canOpenCrafting())return false;init();kitsOpen=true;render();card.focus();return true;}
    function kitKnown(kit){return kit.output!=='consumable_hunting_snare'||H.knows('snare_tightening')&&H.knows('snare_anchor');}
    function craftName(id){var tpl=inv().getItemTemplate(id);return tpl&&inv().getDisplayName?inv().getDisplayName(tpl,0):name(id);}
    function renderKits() {
        node('small','基地制作',card);node('h2',t('hunting.kits'),card);var shown=0;
        C.kits.forEach(function (kit) {
            if(!kitKnown(kit))return;shown++;
            node('h3',craftName(kit.output)+' ×1',card);
            node('p','材料：'+kit.inputs.map(function(r){return craftName(r.item)+' ×'+r.count+'（随身 '+count(r.item)+'）';}).join('、'),card);
            node('p','耗时 1刻 · 消耗体力 '+kit.stamina,card);
            var missing = kit.inputs.some(function (r) { return count(r.item) < r.count; });
            button('制作一份',function () {
                if (!canOpenCrafting()||!kitKnown(kit)) return;
                if (kit.inputs.some(function (r) { return count(r.item)<r.count; }) || global.Survival.getStamina()<kit.stamina || !global.Survival.canPerformStaminaOrEnergyAction()) return;
                kit.inputs.forEach(function (r) { consume(r.item,r.count); });
                global.Survival.consumeStamina(kit.stamina); tick(false); grant({item_id:kit.output,count:1}); refreshAll();
            }, missing || global.Survival.getStamina()<kit.stamina, kit.inputs.map(function (r) { return craftName(r.item)+' ×'+r.count; }).join(' + ')+' · '+t('hunting.cost',{n:kit.stamina}));
        });
        if(!shown)node('p','还没有掌握可制作的捕猎用品。',card);
        button(t('hunting.close'),function () { kitsOpen = false; render(); });
    }
    function renderAdmission() {
        var modal = document.getElementById('modal-livestock'); if (!modal || !H) return;
        var old = document.getElementById('hunting-admission'); if (old) old.remove();
        var parent = modal.querySelector('.lv-main'); if (!parent) return;
        var container = node('section'); container.id = 'hunting-admission'; parent.prepend(container);
        var L = global.LivestockState, ls = L.getState();
        arrays().forEach(function (group) { group.cells.forEach(function (cell,index) {
            if (!cell || !cell.hunting_juvenile) return;
            var j = cell.hunting_juvenile;
            var row = node('div',name(cell.item_id)+' ',container);
            var choices = j.species === 'chicken' ? Object.keys(ls.arms) : Object.keys(ls.zones);
            choices.forEach(function (loc) {
                var check = L.canAdmitAnimal(j.species,loc), b = node('button',t('hunting.admit',{place:t('hunting.place.'+loc)}),row);
                b.disabled = !check.ok; if (!check.ok) b.title = t('hunting.admit_full');
                b.onclick = function () {
                    var current = global.InventoryHelpers.getInventoryContainerArray(group.type)[index];
                    if (H.isActive() || !current || current !== cell || !L.canAdmitAnimal(j.species,loc).ok) return;
                    var result = L.admitAnimal(j.species,loc,{gender:j.gender,perks:j.perks});
                    if (!result.ok) return;
                    inv().takeItemFromContainer(group.type,index);
                    global.SceneApp.updateLivestockPanel(); renderAdmission(); refreshAll();
                };
            });
        }); });
        if (container.childElementCount) node('p',t('hunting.admission_hint'),container);
    }
    global.HuntingPanel = { openCrafting:openCrafting,canOpenCrafting:canOpenCrafting,configure: configure, open: open, render: render, renderAdmission: renderAdmission,
        currentPoint: currentPoint, isOpen: function () { return !!(overlay && !overlay.hidden); } };
})(window);
