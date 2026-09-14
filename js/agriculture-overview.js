(function (global) {
    'use strict';
    var view = 'growth';
    var last = null;
    var openGroups = {};
    var icons = { pool: '≋', channel: '≈', venturi_fertilizer: '◈', buried_pot_jar: '◉', super_fusion: 'ϟ', land: '·' };
    function t(id, params) { return global.UIText ? global.UIText.t('agriculture.overview.' + id, params) : id; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
    function n(v) { return Math.round((Number(v) || 0) * 100) / 100; }
    function key(p) { return p.x + ',' + p.y; }
    function coord(p) { return '(' + p.x + ', ' + p.y + ')'; }
    function name(c) { return c.crop ? c.crop.name || c.crop.cropId : t(c.kind); }
    function sensitiveRisk(c,d,p) { return !c.crop.settled && d.trace_sensitivity && (p.trace > 0 || c.crop.traceAbsorbed > d.trace_safe_max); }
    function sourceButton(p, label) { return '<button type="button" class="agri-source-link" data-agri-jump="' + key(p) + '">' + esc(label || coord(p)) + ' ↗</button>'; }
    function block(title, body) { return '<section class="agri-insight-block"><h3>' + esc(title) + '</h3>' + body + '</section>'; }
    function note(text) { return '<p class="agri-insight-note">' + esc(text) + '</p>'; }
    function band(c, d, dim, supply) {
        var cap = dim.charAt(0).toUpperCase() + dim.slice(1);
        var lo = d['perfectMin' + cap], hi = d['perfectMax' + cap];
        if (lo == null || hi == null || !isFinite(hi)) return null;
        var total = Math.max(1, c.crop.totalTicks || d.growthTicks || 1);
        var low = lo / total, high = hi / total, value = supply[dim];
        var severity = value < low ? 'low' : value > high ? 'high' : 'good';
        var cumulative = c.crop[dim + 'Absorbed'] || 0;
        var max = Math.max(high * 1.35, value * 1.1, .1);
        return { dim: dim, severity: severity, html:
            '<div class="agri-band ' + severity + '"><div class="agri-band-title"><b>' + esc(t(dim)) + '</b><span>' + esc(t(severity)) + '</span></div>' +
            '<div class="agri-band-value">' + n(value) + '<small> / tick</small><span>' + esc(t('ideal')) + ' ' + n(low) + '–' + n(high) + '</span></div>' +
            '<div class="agri-range" aria-label="' + esc(t(dim) + ': ' + n(value) + '; ' + t('ideal') + ' ' + n(low) + '–' + n(high)) + '"><i style="left:' + (low/max*100) + '%;width:' + ((high-low)/max*100) + '%"></i><b style="left:' + Math.min(98,value/max*100) + '%"></b></div>' +
            '<div class="agri-band-total">' + esc(t('accumulated')) + ' ' + n(cumulative) + ' · ' + esc(t('seasonIdeal')) + ' ' + n(lo) + '–' + n(hi) + '</div></div>' };
    }
    function initialize() {
        var wrap = document.querySelector('#modal-agriculture .agri-grid-wrap');
        if (!wrap || document.getElementById('agriculture-view-tabs')) return;
        var summary = document.createElement('div'); summary.id = 'agriculture-overview-summary'; summary.className = 'agri-summary';
        document.querySelector('#modal-agriculture .agri-body').before(summary);
        var tabs = document.createElement('nav'); tabs.id = 'agriculture-view-tabs'; tabs.className = 'agri-view-tabs'; tabs.setAttribute('aria-label', t('views'));
        ['growth','water','nutrients','soil'].forEach(function (v) {
            var b = document.createElement('button'); b.type = 'button'; b.dataset.view = v; b.textContent = t('view.'+v);
            b.onclick = function () { view = v; if (last) last.refresh(); }; tabs.appendChild(b);
        }); wrap.prepend(tabs);
        var legend = document.createElement('div'); legend.id = 'agriculture-map-legend'; legend.className = 'agri-map-legend'; wrap.appendChild(legend);
    }
    function enhance(st, selected, select, refresh) {
        initialize(); last = { refresh: refresh };
        var A = global.AgricultureMap;
        if (!A || !A.inspectSupply) return;
        var detail = document.getElementById('agriculture-cell-detail'), grid = document.getElementById('agriculture-grid');
        if (!detail || !grid) return;
        var inspection = A.inspectSupply(st), current = st.map[selected.y][selected.x];
        var stats = { growing: 0, ready: 0, risk: 0 }, bands = {}, related = {}, roles = {};
        var sources = inspection.plots[key(selected)];
        Object.keys(inspection.plots).forEach(function (k) {
            var xy = k.split(',').map(Number), c = st.map[xy[1]][xy[0]], d = A.getCropDefForInstance(c.crop);
            bands[k] = ['water','fertilizer','trace'].map(function (dim) { return band(c,d,dim,inspection.plots[k]); }).filter(Boolean);
            if (c.crop.settled) { if (c.crop.harvestCount > 0) stats.ready++; else stats.risk++; }
            else { stats.growing++; if (bands[k].some(function (b) { return b.severity !== 'good'; }) || c.crop.healthCurrent < c.crop.healthMax || sensitiveRisk(c,d,inspection.plots[k])) stats.risk++; }
        });
        if (sources) {
            if (sources.source) { related[key(sources.source)] = true; roles[key(sources.source)] = t('waterSource'); }
            sources.jars.forEach(function (p) { related[key(p)] = true; roles[key(p)] = t('fertilizerSource'); });
        }
        var routes = inspection.routes.filter(function (r) {
            if (current.kind === 'venturi_fertilizer') return key(r.device) === key(selected);
            if (current.kind === 'channel') return r.cells.some(function (p) { return key(p) === key(selected); });
            return sources && sources.source && r.cells.some(function (p) { return key(p) === key(sources.source); });
        });
        routes.forEach(function (r) {
            related[key(r.device)] = true; roles[key(r.device)] = t('traceSource');
            r.cells.forEach(function (p) { related[key(p)] = true; });
            if (r.request) { related[key(r.request)] = true; roles[key(r.request)] = t('requester'); }
        });
        if (current.kind === 'buried_pot_jar' || current.kind === 'channel' || current.kind === 'pool' || current.kind === 'venturi_fertilizer') {
            Object.keys(inspection.plots).forEach(function (k) {
                var p = inspection.plots[k];
                if (p.jars.some(function (j) { return key(j) === key(selected); }) ||
                    p.source && (key(p.source) === key(selected) || routes.some(function (r) { return r.cells.some(function (q) { return key(q) === key(p.source); }); }))) related[k] = true;
            });
        }
        var summary = document.getElementById('agriculture-overview-summary');
        var powered = A.isSuperFusionPowered(st);
        summary.innerHTML = ['growing','ready','risk'].map(function (s) { return '<div class="agri-stat ' + s + '"><b>' + stats[s] + '</b><span>' + esc(t(s)) + '</span></div>'; }).join('') +
            '<div class="agri-stat power"><b>' + esc(t(powered ? 'fusionOn' : 'fusionOff')) + '</b><span>' + esc(t('powerRemaining')) + ' ' + n(st.power_charge) + '</span></div>';
        document.querySelectorAll('#agriculture-view-tabs button').forEach(function (b) { b.setAttribute('aria-pressed',String(b.dataset.view === view)); });
        var soilNames = {};
        grid.dataset.view = view;
        grid.querySelectorAll('.agri-cell').forEach(function (btn) {
            var x = Number(btn.dataset.x), y = Number(btn.dataset.y), c = st.map[y][x], k = x+','+y;
            var p = inspection.plots[k], cropBands = bands[k] || [], risk = c.crop && !c.crop.settled && (cropBands.some(function (b) { return b.severity !== 'good'; }) || c.crop.healthCurrent < c.crop.healthMax || sensitiveRisk(c,A.getCropDefForInstance(c.crop),p));
            var mark = c.crop ? '♧' : icons[c.kind] || '·';
            var label = c.crop ? c.crop.name : c.kind === 'land' ? (c.tilled ? t('tilled') : '') : t(c.kind);
            var metric = '', arrow = '';
            if (view === 'water') {
                if (c.kind === 'channel') metric = n(c.water)+' / '+n(c.capacity);
                else if (p) metric = n(p.water)+' / tick';
                if (c.sourceParent) { var parent = c.sourceParent.split(',').map(Number); arrow = x>parent[0]?'→':x<parent[0]?'←':y>parent[1]?'↓':'↑'; }
            } else if (view === 'nutrients') {
                if (p) metric = t('shortFert')+n(p.fertilizer)+' · '+t('shortTrace')+n(p.trace);
                else if (c.kind === 'channel') metric = t('shortTrace')+n(c.seaweedConcentration);
            } else if (view === 'soil' && c.kind === 'land') {
                var soil = p && p.soil, soilName = soil ? soil.display_name : c.soilType || t('defaultSoil');
                metric = soilName;soilNames[soilName] = true;
                btn.dataset.soil = c.soilId || 'soil_saline_alkali';
            } else if (c.crop) metric = c.crop.settled ? t(c.crop.harvestCount>0?'ready':'failed') : n(c.crop.remainingTicks)+'t';
            btn.classList.toggle('supply-related',!!related[k]);btn.classList.toggle('supply-requester',roles[k]===t('requester'));btn.classList.toggle('crop-risk',!!risk);
            btn.setAttribute('aria-pressed',String(key(selected)===k));
            btn.setAttribute('aria-label',coord({x:x,y:y})+' '+label+' '+metric+(roles[k]?' '+roles[k]:''));
            btn.title=coord({x:x,y:y})+' '+label+' '+metric+(roles[k]?' · '+roles[k]:'');
            if (!(st.task && st.task.x===x && st.task.y===y)) btn.innerHTML = '<span class="agri-tile-icon" aria-hidden="true">'+mark+'</span><span class="agri-tile-name">'+esc(label)+'</span><small>'+esc(metric)+'</small>'+ (arrow?'<i class="agri-flow-arrow">'+arrow+'</i>':'')+(risk?'<b class="agri-alert-dot">!</b>':'');
        });
        document.getElementById('agriculture-map-legend').textContent=t('legend.'+view)+' · '+t('relationshipLegend');
        var html='<div class="agri-selected-title"><span>'+esc(coord(selected))+'</span><h2>'+esc(name(current))+'</h2></div>';
        if (current.crop && sources) {
            var d = A.getCropDefForInstance(current.crop), crop = current.crop, cb = bands[key(selected)];
            var health = crop.healthMax ? Math.round(crop.healthCurrent/crop.healthMax*100) : 100;
            var issues=cb.filter(function(b){return b.severity!=='good';}).map(function(b){return t(b.dim)+' · '+t(b.severity);});
            if (sensitiveRisk(current,d,sources)) issues.push(t('traceExposure'));
            if (health<100) issues.push(t('healthReduced'));
            html += '<div class="agri-verdict '+(issues.length?'warn':'')+'">'+esc(crop.settled ? crop.resultLabel || t('settled') : issues.length ? issues.join(' / ') : t('supplySuitable'))+'</div>';
            html += note(crop.settled?t('settledNote'):t('rateNote'));
            html += '<div class="agri-growth-track"><span style="width:'+Math.max(0,Math.min(100,(1-crop.remainingTicks/crop.totalTicks)*100))+'%"></span></div>'+note(t('health')+' '+health+'% · '+t('remaining')+' '+n(crop.remainingTicks)+' tick');
            if (!crop.settled) html += cb.map(function(b){return b.html;}).join('');
            if (d.trace_sensitivity) html += block(t('trace'),note(t('currentAbsorption')+' '+n(sources.trace)+' / tick')+note(t('sensitive')+' '+n(crop.traceAbsorbed)+' / '+n(d.trace_safe_max)));
            var linked = sources.source ? sourceButton(sources.source,t('waterSource')+' '+coord(sources.source)) : note(t('noWater'));
            linked += sources.jars.map(function(j){return sourceButton(j,t('jarSource')+' '+coord(j)+' +'+n(j.amount));}).join('');
            var seen={};routes.forEach(function(r){if(!seen[key(r.device)]){seen[key(r.device)]=true;linked+=sourceButton(r.device,t('traceSource')+' '+coord(r.device));}});
            html += block(t('sources'),linked);
            html += block(t('soil'),note(sources.soil.display_name+' → '+t('effective')+' '+sources.effectiveSoil.display_name)+note(t('retention')+' '+Math.round(sources.effectiveSoil.water_retention*100)+'% / '+Math.round(sources.effectiveSoil.fertilizer_retention*100)+'% / '+Math.round(sources.effectiveSoil.trace_retention*100)+'%'));
            if(sources.soilEffect) html+=note(t('soilExtras'));
        }
        if (current.kind==='venturi_fertilizer') {
            var liq=current.venturiLiquid;
            var activeRoute=routes[0], endurance=activeRoute&&activeRoute.actualTotal>0&&liq?Math.floor((Number(liq.nutrientRemaining)||0)/activeRoute.actualTotal):null;
            html+=block(t('supplyRelations'),note(t(powered?'modeA':'modeB'))+(liq?note('剩余养分 '+n(liq.nutrientRemaining)+(endurance!=null?' · 约 '+endurance+' tick':'')):note(t('noMaterial'))));
            if (!routes.length) html+=note(t('noActiveRoute'));
            routes.forEach(function(r){html+=block(r.request?t('requester'):t('noRequestMode'),(r.request?sourceButton(r.request,st.map[r.request.y][r.request.x].crop.name+' '+coord(r.request)):'')+note(t('covered')+' '+r.cells.length+' · 目标 '+n(r.target)+' · 实际 '+n(r.share))+note('设备总输出 '+n(r.actualTotal)+' / '+n(r.outputCap)));});
        }
        if (current.kind==='buried_pot_jar') {
            var served=Object.keys(inspection.plots).filter(function(k){return inspection.plots[k].jars.some(function(j){return key(j)===key(selected);});});
            html+=block(t('served'),served.length?served.map(function(k){var xy=k.split(',').map(Number);return sourceButton({x:xy[0],y:xy[1]},name(st.map[xy[1]][xy[0]])+' ('+k+')');}).join(''):note(t('noServed')));
            var jarLiq=current.jarLiquid,jarRate=Number(current.jarReleaseRate)||0;
            html+=note('总释放 '+n(jarRate)+'/tick · 生长作物平均分配'+(jarLiq?' · 剩余养分 '+n(jarLiq.nutrientRemaining)+(jarRate>0?' · 约 '+Math.floor((Number(jarLiq.nutrientRemaining)||0)/jarRate)+' tick':''):' · 当前为空'));
        }
        if (current.kind==='pool') {
            html+=block('水源状态',note('固定供水 200/tick')+note('无需升级，不受天气与蓄水状态影响'));
        }
        var old=detail.innerHTML;
        detail.innerHTML=html+'<details class="agri-raw-details"><summary>'+esc(t('moreDetails'))+'</summary>'+old+'</details>';
        detail.querySelectorAll('[data-agri-jump]').forEach(function(b){b.onclick=function(){var p=b.dataset.agriJump.split(',').map(Number);select(p[0],p[1]);};});
        organizeActions(selected);
        bindPreviews(st, selected, inspection);
    }
    function bindPreviews(st, selected, before) {
        var A=global.AgricultureMap, actions=document.getElementById('agriculture-actions');
        if (!Array.prototype.some.call(actions.querySelectorAll('button'),function(b){return !!b.agriculturePreviewMeta;})) return;
        var preview=document.createElement('div');preview.className='agri-change-preview';preview.setAttribute('aria-live','polite');preview.textContent=t('previewHint');actions.prepend(preview);
        var taskTypes={channel_dig:'build',channel_remove:'remove',channel_upgrade:'upgrade',channel_downgrade:'downgrade',land_reclaim:'till',land_remove_reclaim:'remove_tilled',venturi_fertilizer:'build_venturi',venturi_fertilizer_remove:'remove_venturi',buried_pot_jar:'build_buried_pot_jar',buried_pot_jar_remove:'remove_buried_pot_jar',super_fusion:'build_super_fusion',super_fusion_remove:'remove_super_fusion',crop_structure_remove:'remove_crop_structure'};
        actions.querySelectorAll('button').forEach(function(btn){
            var meta=btn.agriculturePreviewMeta;if(!meta)return;
            var change=null;
            if(meta.cropId)change={cropId:meta.cropId};
            else if(meta.buildId && taskTypes[meta.buildId])change={task:{type:taskTypes[meta.buildId]}};
            else if(meta.buildId && meta.buildId.indexOf('crop_structure_')===0)change={task:{type:'build_crop_structure',structureId:meta.buildId.slice(15)}};
            else if(meta.inputs && meta.inputs[0] && global.AgricultureConfig){var soil=global.AgricultureConfig.getGrantsSoilId(meta.inputs[0].item_id);if(soil)change={task:{type:'soil_amend',soilId:soil,soilType:soil}};}
            if(!change)return;
            var show=function(){
                document.querySelectorAll('#agriculture-grid .preview-affected').forEach(function(b){b.classList.remove('preview-affected');});
                var result=A.previewChange(st,selected.x,selected.y,change);
                if(!result.ok){preview.textContent=result.required?t('requires')+' '+global.UIText.t('agriculture.structure.'+result.required):t('cannotPreview');return;}
                var after=A.inspectSupply(result.state),rows=[];
                Object.keys(after.plots).forEach(function(k){var old=before.plots[k],now=after.plots[k],parts=[];
                    ['water','fertilizer','trace'].forEach(function(dim){if(!old||n(now[dim])!==n(old[dim]))parts.push(t(dim)+' '+(old?n(old[dim])+' → ':'')+n(now[dim]));});
                    if(parts.length){var xy=k.split(',').map(Number),c=result.state.map[xy[1]][xy[0]];rows.push(name(c)+': '+parts.join(' / '));var b=document.querySelector('#agriculture-grid [data-x="'+xy[0]+'"][data-y="'+xy[1]+'"]');if(b)b.classList.add('preview-affected');}
                });
                var lost=change.task&&(change.task.type==='remove_venturi'||change.task.type==='remove_buried_pot_jar')
                    ?Number((current.venturiLiquid||current.jarLiquid||{}).nutrientRemaining)||0:0;
                preview.innerHTML='<b>'+esc(t('previewTitle'))+'</b>'+note(rows.length?rows.slice(0,4).join('\n'):t('noSupplyChange'))+(lost>0?note('拆除完成将损失 '+n(lost)+' 点剩余养分'):'')+note(t('previewScope'));
            };
            btn.addEventListener('mouseenter',show);btn.addEventListener('focus',show);
            btn.addEventListener('mouseleave',function(){if(document.activeElement!==btn)clear();});btn.addEventListener('blur',clear);
            function clear(){preview.textContent=t('previewHint');document.querySelectorAll('#agriculture-grid .preview-affected').forEach(function(b){b.classList.remove('preview-affected');});}
        });
    }
    function organizeActions(selected) {
        var actions=document.getElementById('agriculture-actions');if(!actions)return;
        var children=Array.prototype.slice.call(actions.children),section=null;
        children.forEach(function(child){
            if(child.classList.contains('agri-act-group')){
                section=document.createElement('details');section.className='agri-action-section';
                var groupKey=key(selected)+'|'+child.textContent;
                section.open=Object.prototype.hasOwnProperty.call(openGroups,groupKey)?openGroups[groupKey]:child.textContent===global.UIText.t('agriculture.action.group.plant')||child.textContent===global.UIText.t('agriculture.action.group.land');
                (function(el,k){el.addEventListener('toggle',function(){if(el.isConnected)openGroups[k]=el.open;});})(section,groupKey);
                var summary=document.createElement('summary');summary.textContent=child.textContent;section.appendChild(summary);actions.insertBefore(section,child);child.remove();
            }else if(section)section.appendChild(child);
        });
        actions.querySelectorAll('.agri-action-section').forEach(function(el){if(el.children.length===1)el.remove();});
    }
    global.AgricultureOverview={enhance:enhance};
})(typeof window!=='undefined'?window:globalThis);
