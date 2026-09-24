/* First pond: configuration-driven encounter provider. Real inventory stays in ItemAssembly.
   Only getPublicState is UI data. getState is a save snapshot, never a player-facing view. */
(function (g) {
    'use strict';
    var C, hostOverride, busy = false, pendingFacts = [];
    function clone(x) { return JSON.parse(JSON.stringify(x)); }
    function fresh() { return {version:1,seed:123456789,initialized:false,starter:false,selectedRig:null,lureStyle:"steady",lureSpeed:"medium",retrieveLeft:0,drag:"medium",station:0,point:0,depth:12,notes:{},knowledge:{},logs:[],water:[],candidate:null,snag:0,serial:0,gatherAt:0}; }
    var s = fresh();
    function IE() { return g.InventoryEquipment; }
    function FS() { return g.FishingSession; }
    function active() { return FS().getState().active; }
    function now() { return g.GameTime ? g.GameTime.getState().totalTicks : 0; }
    function h() { return hostOverride || {now:now,allowed:function(){return true;},stamina:function(){return g.Survival.getStamina();},spend:function(n){g.Survival.consumeStamina(n);},tick:function(){g.Survival.advanceTick();}}; }
    function clock() { return h().now(); }
    function log(text) { s.logs.unshift({tick:clock(),text:text}); s.logs=s.logs.slice(0,C.rules.max_logs); }
    function roll() { s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296; }
    function pick(weights) { var total=weights.reduce(function(a,b){return a+b;},0); if(!total)return -1;var n=roll()*total;for(var i=0;i<weights.length;i++){n-=weights[i];if(n<0)return i;}return weights.length-1; }
    function range(a) { return a[0]+Math.floor(roll()*(a[1]-a[0]+1)); }
    function configure(c) {
        if(!c||c.version!==1||!Array.isArray(c.points)||c.points.length!==5||!Array.isArray(c.stations)||c.stations.length!==3)return false;
        if(!c.stations.every(function(st){return Array.isArray(st.routes)&&st.routes.length===c.points.length&&st.routes.every(function(r){return r===null||r&&Number.isInteger(r.distance_dm)&&r.distance_dm>0&&Number.isInteger(r.hand_line_required_dm)&&r.hand_line_required_dm>0&&Number.isInteger(r.obstacle)&&r.obstacle>=0&&r.obstacle<=2;});}))return false;
        if(!g.FishingFacts||!c.fact_rules||!g.FishingFeedback||!c.feedback_rules)return false;
        try{g.FishingFacts.validateConfig(c.fact_rules);g.FishingFeedback.validate(c.feedback_rules);}catch(e){return false;}
        C=clone(c);return true;
    }
    function initialize() { if(s.initialized)return;s.seed=((Math.random()*4294967296)>>>0)||1;s.water=C.points.map(function(p){return {stock:p.stocks.slice(),nest:{},updated:clock(),recovered:clock(),disturbance:0};});s.initialized=true; }
    function updateWater() {
        if(!s.initialized)return;
        s.water.forEach(function(w,i){
            var elapsed=Math.max(0,clock()-w.updated);w.disturbance=Math.max(0,w.disturbance-elapsed);
            Object.keys(w.nest).forEach(function(k){var n=w.nest[k],periods=Math.floor(Math.max(0,clock()-n.at)/C.rules.nest_period);n.count=Math.max(0,n.count-periods);n.at+=periods*C.rules.nest_period;if(!n.count)delete w.nest[k];});
            var days=Math.floor(Math.max(0,clock()-w.recovered)/C.rules.recovery_period);
            if(days){w.stock=w.stock.map(function(n,j){return Math.min(C.points[i].stocks[j],n+days);});w.recovered+=days*C.rules.recovery_period;}
            w.updated=clock();
        });
    }
    function reachable() { return C.stations[s.station].routes[s.point]!==null; }
    function tackleNumber(type,key){var p=part(type),t=p&&IE().getItemTemplate(p.item_id),n=t&&g.ItemAttributeModules.getTemplateValue(t,key);return Number.isInteger(n)&&n>0?n:0;}
    function depthLimit(){return Math.min(C.depth.max,tackleNumber('fishing.main_line','fishing_length_dm')+tackleNumber('fishing.leader','fishing_length_dm'));}
    function castLimit(){
        var route=C.stations[s.station].routes[s.point];if(!route)return 'unreachable';
        if(!rig())return 'rig_not_found';
        if(!part('fishing.main_line')||!part('fishing.leader'))return 'rig_incomplete';
        var reach=tackleNumber('fishing.rig_root','fishing_cast_range_dm'),length=tackleNumber('fishing.main_line','fishing_length_dm');
        if(!reach||!length)return 'tackle_spec_missing';
        if(route.distance_dm>reach)return 'rod_range';
        if((isLure()?route.distance_dm:route.hand_line_required_dm)>length)return 'line_short';
        if(!isLure()&&s.depth>depthLimit())return 'depth_line_short';
        return null;
    }
    function ready() { var a=active();return !a||(!a.needs_retrieval&&(a.phase==='ready'||a.phase==='ended')); }
    function rig() { var a=active();return IE().findItemInstanceRecord(a?a.rig_instance_id:s.selectedRig); }
    function part(type) { var found=null,r=rig();function walk(x){if(g.ItemAssembly.getPartTypes(x).indexOf(type)>=0)found=x;IE().getItemInstanceChildren(x).forEach(function(c){walk(c.instance);});}if(r)walk(r.instance);return found; }
    function isLure(){return !!part('fishing.lure_rod');}
    function carried() { var st=IE().getState(),out=[];['pocket','vest','backpack'].forEach(function(t){(st['inventory_'+t]||[]).forEach(function(x,i){if(x)out.push({type:t,index:i,item:x});});});return out; }
    function name(x) { var tpl=IE().getItemTemplate(x.item_id);return IE().getDisplayName(tpl,0); }
    function learn(key,proof) {
        var k=s.knowledge[key]||(s.knowledge[key]={proofs:[],known:false});
        if(k.proofs.indexOf(proof)<0&&k.proofs.length<C.rules.evidence_required)k.proofs.push(proof);
        if(!k.known&&k.proofs.length>=C.rules.evidence_required){k.known=true;log('你把这些见闻联系了起来，对它的作用有了更明确的认识。');}
    }
    function learnPart(type,proof){var p=part(type);if(p)learn('item:'+p.item_id,proof);}
    function knows(key) { return !!(s.knowledge[key]&&s.knowledge[key].known); }
    function recognition(id) { if(!C)return null;var fish=C.fish.some(function(f){return f.id===id;});return /^fishing_/.test(id)?knows((fish?'fish:':'item:')+id):null; }
    function pay(key) { var cost=C.costs[key];if(!cost||h().stamina()<cost[1])return {ok:false,reason:'stamina'};h().spend(cost[1]);for(var i=0;i<cost[0];i++)h().tick();updateWater();return {ok:true}; }
    function available(key) { return h().stamina()>=C.costs[key][1]; }
    function present() { var f=part('fishing.float'),w=part('fishing.sinker');return f&&w&&C.presentation[f.item_id]?C.presentation[f.item_id][w.item_id]||'normal':'sunk'; }
    function light() { var gt=g.GameTime&&g.GameTime.getState(),hours=C.fact_rules.visual_hours;return !gt||gt.hour==null||(gt.hour>=hours[0]&&gt.hour<hours[1]); }
    function recordFacts(source,facts,inspection){
        var channels=['touch','sound'];if(light()||facts.includes('float_visibility_insufficient'))channels.push('visual');if(inspection&&light())channels.push('inspection');
        var ledger=g.FishingFacts.create(C.fact_rules,s.factHistory);
        var event=ledger.record({source:source,tick:clock(),water:C.entry.map,point:String(s.point),actual:facts,channels:channels});s.factHistory=ledger.getState();pendingFacts.push(event);
    }
    function flushFeedback(){
        if(!pendingFacts.length)return;
        var signature=JSON.stringify(pendingFacts.map(function(e){return [e.source,e.water,e.point,e.facts,e.channels];}));
        var repeat=pendingFacts.every(function(e){return C.feedback_rules.dispatch.repeat_sources.includes(e.source);});
        if(repeat&&s.lastFeedbackSignature===signature&&s.logs[0]&&s.logs[0].factSignature===signature){s.logs[0].tick=clock();s.logs[0].repeats=(s.logs[0].repeats||1)+1;return;}
        var selector=g.FishingFeedback.create(C.feedback_rules,s.feedbackHistory);
        var text=selector.compose(pendingFacts,{float:knows('float')?'浮漂':'线上的浮物'});
        s.feedbackHistory=selector.getState();s.lastFeedbackSignature=signature;
        if(text){log(text);s.logs[0].factSignature=signature;}
    }
    function inspectFacts(retrieved){
        var facts=retrieved?['retrieve_completed']:[];
        if(part('fishing.hook')){facts.push('hook_inspected','hook_present',part('fishing.bait')?'bait_present':'bait_absent',s.attachedGrass&&s.attachedGrassHook===part('fishing.hook').instance_id?'grass_attached':'no_visible_attachment');}else facts.push('hook_absent');
        facts.push('terminal_inspected',part('fishing.leader')?'leader_present':'leader_absent');
        var line=part('fishing.main_line');if(line){facts.push('line_inspected');if((line.fishing_wear_stage||0)>=C.fact_rules.wear_visible_at)facts.push('visible_local_fraying');}
        return facts;
    }
    function captureFacts(key,before,result){
        var a=active(),facts=[],source=key,inspection=false;
        if(key==='cast'&&result.ok){s.previousLoad=null;facts=['holding_rod'];if(!isLure()&&light()){facts.push('float_visible_at_start');if(present()==='sunk')facts.push('float_submerged','no_reappearance');else if(a.phase==='waiting')facts.push('float_visible','float_stable','no_visible_change');}}
        else if(key==='wait'&&a&&a.phase==='waiting'){facts=!light()?['float_visibility_insufficient']:(present()!=='sunk'?['float_visible','float_stable','no_visible_change']:['float_submerged','no_reappearance']);}
        else if(key==='strike'){facts=['holding_rod','strike_completed'];facts=C.fact_rules.strike_profiles[result.hooked?'hooked':result.brief_contact?'brief':'miss'].slice();}
        else if(key==='fight'){
            facts=['holding_rod'];if(result.broken||result.fish_lost)facts.push('sustained_tension_before','sudden_tension_loss');
            else {facts.push('pull_persists');facts.push(a.progress>before.progress?'progress_perceived':'no_observed_progress');if(a.last_feedback==='line_pays_out')facts.push('payout_perceived');if(s.previousLoad!=null&&s.previousLoad!==result.load)facts.push('tension_strength_varies');}s.previousLoad=result.load;
        }
        else if(key==='snag'){
            facts=['holding_rod','retrieval_attempt'];if(s.snag){facts.push('fixed_direction_resistance');if(before.snag&&before.value==='relax')facts.push('relax_then_pull','same_obstruction_persists');if(a&&a.phase==='fight'&&a.contact&&a.contact.current_pull_pulses)facts.push('separate_pull_pulses');}
            else if(!result.broken)facts.push('obstruction_released','retrieval_possible');else facts.push('sustained_tension_before','sudden_tension_loss');
        }
        else if(key==='retrieve'||key==='inspect'||key==='workLure'&&a&&a.phase==='ready'){source=key==='inspect'?'inspect':'retrieve';facts=inspectFacts(key!=='inspect');inspection=true;}
        else if(key==='probe'){facts=[C.points[s.point].probe_evidence==='estimate'?'bottom_estimate_obtained':'bottom_unconfirmed'];}

        else if(['attach','detach','bait','depth'].includes(key)&&before.setup!==JSON.stringify([s.depth,rig()&&rig().instance])){source='prepare';facts=['component_changed'];inspection=true;}
        if(facts.length)recordFacts(source,facts,inspection);
        if(key==='fight'&&a&&a.phase==='landed')recordFacts('catch',['catch_visible'],true);
    }
    function layer(depth) { return depth<=5?0:(C.points[s.point].depth-depth<=4?2:1); }
    function feedback() { var a=active();if(a&&C.feedback_rules.dispatch.legacy_keys.includes(a.last_feedback)&&C.feedback[a.last_feedback])log(C.feedback[a.last_feedback]); }
    function loseCandidate() { s.candidate=null; }
    function contactFor(c,inMouth) {
        var f=C.fish[c.fish];return {event_id:'pond:'+c.serial,catch_profile_id:f.id,load_rating:f.loads[c.size],endurance:C.stations[s.station].landing,hook_fit:(C.hook_fit[(part('fishing.hook')||{}).item_id]||{})[f.id]||f.hook,in_mouth:inMouth,takes_bait_on_strike:inMouth&&!isLure(),visible_signal:isLure()?(light()?'surface_splash':'surface_sound'):(c.signal||'clear_movement'),behavior_sequence:c.sequence};
    }
    function removeBait() { var b=part('fishing.bait');if(!b)return;var r=IE().findItemInstanceRecord(b.instance_id);g.ItemAssembly.discardConnectionSubtree(r.parent.instance_id,r.relation_key); }
    function encounter(sinking) {
        updateWater();var a=active();if(!a||a.phase!=='waiting'||s.snag)return;
        var b=part('fishing.bait'),bait=b&&C.bait[b.item_id],water=s.water[s.point],l=layer(Math.min(s.depth,C.points[s.point].depth));
        var lure=isLure(),hasNest=Object.keys(water.nest).length>0;if(lure)l=0;
        var chance=bait?C.rules.approach+bait.smell*C.rules.smell_bonus+(hasNest?C.rules.nest_bonus:0)-water.disturbance*C.rules.disturbance_penalty:C.rules.bare_hook;
        if(lure)chance=C.lure.approach+C.lure.style_weights[s.lureStyle]+C.lure.speed_weights[s.lureSpeed]-water.disturbance*C.rules.disturbance_penalty;
        if(roll()*100>=Math.max(0,chance))return;
        var weights=C.fish.map(function(f,i){if(lure)return water.stock[i]*(C.lure.fish_weights[i]||0);var layers=f.layers[l];if(sinking&&present()!=='sunk')layers=Math.max(layers,f.layers[0]);return water.stock[i]*layers*(bait?(f.food[bait.food]||0):1);});
        var fi=pick(weights);if(fi<0)return;
        var f=C.fish[fi],outcome=pick(lure?C.lure.signals:C.rules.signals);
        if(outcome===0)return;
        if(outcome===3){if(b)removeBait();return;}
        var sz=pick(f.sizes),seq=[],fatigue=0;
        for(var j=0;j<4;j++){var bw=f.behaviors.slice();if(!C.points[s.point].grass)bw[2]=0;var behavior=clone(C.behaviors[fatigue>=C.rules.fatigue_limit?3:pick(bw)]);seq.push(behavior);fatigue+=behavior.fatigue;}seq.push(clone(C.behaviors[3]));
        var c={fish:fi,size:sz,weight:range([f.weights[sz][0],f.weights[sz][1]-(sz<2?1:0)]),length:range(f.lengths[sz]),baitId:b?b.item_id:null,sequence:seq,serial:++s.serial,inMouth:outcome===2,follow:roll()<0.5,observed:false,landed:false,item:null,landedAt:null};
        // No automatic decision notification for a signal the character cannot perceive.
        if(!lure&&(present()==='sunk'||!light())){if(c.inMouth&&roll()<0.5)removeBait();return;}
        if(!lure){var sig=C.fact_rules.contact_signals[pick(C.fact_rules.contact_signals.map(function(x){return x.weight;}))];c.signal=sig.id;c.signalFacts=sig.facts.slice();}s.candidate=c;FS().acceptContactEvent(contactFor(c,c.inMouth));feedback();
        var signal=active().last_feedback;recordFacts('signal',c.signalFacts||C.fact_rules.signal_profiles[signal]||[],false);
    }
    function obstacle() {
        var p=C.points[s.point],grass=layer(s.depth)===2||p.grass===2?p.grass:0;
        grass=Math.max(grass,(C.stations[s.station].routes[s.point]||{}).obstacle||0);
        if(roll()*100<C.rules.grass_contact[grass]){var contact=pick(C.rules.grass_results);if(contact===1){s.attachedGrass=true;s.attachedGrassHook=(part('fishing.hook')||{}).instance_id||null;}if(contact===2){s.snag=1;recordFacts('snag',['holding_rod','retrieval_attempt','fixed_direction_resistance'],false);return true;}}return false;
    }
    function ensureSession(id) {
        var a=active();if(a&&a.phase==='ready'&&a.rig_instance_id===id&&a.point_id==='pond:'+s.point)return {ok:true};
        if(a){var closed=FS().close();if(!closed.ok)return closed;}
        return FS().start(id,'pond:'+s.point);
    }
    function settle() {
        var a=active(),c=s.candidate;
        if(!a||!c)return;
        if(a.phase==='landed'&&!c.landed){
            var w=s.water[s.point];if(w.stock[c.fish]<=0)throw new Error('Reserved fish missing');
            w.stock[c.fish]--;w.disturbance=3;c.landed=true;c.landedAt=clock();
            c.item=IE().ensureItemInstanceIdentity({item_id:C.fish[c.fish].id,count:1,spoilage_elapsed_ticks:0,fishing_catch:{weight_kg:c.weight/1000,length_cm:c.length}},false);
            ['fishing.rig_root','fishing.main_line','fishing.leader','fishing.hook'].forEach(function(type){learnPart(type,'catch');});if(c.baitId)learn('item:'+c.baitId,'catch:'+c.serial);learn('fish:'+c.item.item_id,'catch:'+c.serial);learn('bite','catch:'+c.serial);
            if(light())log(C.fish[c.fish].appearance+'被带上岸边。');else log('已经把鱼带到岸边，光线太暗，看不清它的模样。');
        }
        if(a.phase==='ended'){w=s.water[s.point];w.disturbance=3;loseCandidate();}
    }
    function act(key,value) {
        if(!C||busy)return {ok:false,reason:'unavailable'};
        if(key!=='close'&&h().allowed&&!h().allowed())return {ok:false,reason:'location'};
        busy=true;pendingFacts=[];
        try{var a=active(),before={progress:a?a.progress:0,snag:s.snag,value:value,setup:JSON.stringify([s.depth,rig()&&rig().instance])};var result=perform(key,value);if(result.ok)captureFacts(key,before,result);flushFeedback();return result;}finally{busy=false;pendingFacts=[];}
    }
    function perform(key,value) {
        initialize();var a=active(),r;if(s.snag&&['snag','cut','close'].indexOf(key)<0)return {ok:false,reason:'snag'};
        if(['lureStyle','lureSpeed','station','point','inspect','observe','probe','depth','bait','nest','gather','select','attach','detach'].indexOf(key)>=0&&!ready())return {ok:false,reason:'busy'};
        if(key==='lureStyle'||key==='lureSpeed'){
            var table=key==='lureStyle'?C.lure.style_weights:C.lure.speed_weights;
            if(!isLure()||!Object.prototype.hasOwnProperty.call(table,value))return {ok:false,reason:'invalid'};
            s[key]=value;return {ok:true};
        }
        if(key==='drag'){
            if(!isLure()||['loose','medium','tight'].indexOf(value)<0)return {ok:false,reason:'invalid'};
            if(a&&a.phase==='fight'){r=FS().setDrag(value);if(!r.ok)return r;}else if(!ready())return {ok:false,reason:'phase'};
            s.drag=value;return {ok:true};
        }
        if(key==='point'){if(!Number.isInteger(value)||!C.points[value])return {ok:false,reason:'invalid'};s.point=value;return {ok:true};}
        if(key==='station'){if(!Number.isInteger(value)||!C.stations[value])return {ok:false,reason:'invalid'};if(value===s.station)return {ok:true};r=pay('station');if(r.ok){s.station=value;log('来到'+C.stations[value].name+'。');}return r;}
        if(key==='select'){if(!carried().some(function(x){return x.item.instance_id===value&&g.ItemAssembly.getPartTypes(x.item).indexOf('fishing.rig_root')>=0;}))return {ok:false,reason:'rig_not_found'};if(a)FS().close();s.selectedRig=value;return {ok:true};}
        if(key==='attach'||key==='detach'){
            if(!value||!rig()||!g.ItemAssembly.treeContains(rig().instance,value.host))return {ok:false,reason:'invalid'};
            if(!available('prepare'))return {ok:false,reason:'stamina'};
            r=key==='attach'?g.ItemAssembly.attachFromContainer(value.host,value.slot,value.source,value.index):g.ItemAssembly.detachToInventory(value.host,value.slot);
            if(r.ok){pay('prepare');log(key==='attach'?'把手边的部件接了上去。':'取下部件，放回随身物品。');}return r;
        }
        if(key==='inspect'){
            if(!rig())return {ok:false,reason:'rig_not_found'};r=pay('inspect');if(!r.ok)return r;
            var line=part('fishing.main_line'),fl=part('fishing.float');
            function inspectPart(x){learn('item:'+x.item_id,'inspect');IE().getItemInstanceChildren(x).forEach(function(c){inspectPart(c.instance);});}inspectPart(rig().instance);if(fl)learn('float','inspect');return r;
        }
        if(key==='gather'){
            if(clock()<s.gatherAt)return {ok:false,reason:'searched'};r=pay('gather');if(!r.ok)return r;s.gatherAt=clock()+C.rules.gather_period;
            if(roll()<0.6){var worm={item_id:'fishing_bait_worm',count:1};var placed=IE().putItemIntoDefaultContainer(worm);if(!placed.placed){var pos=g.GameEngine.getState();IE().addItemToGround(pos.mapId,pos.x,pos.y,worm);}log('翻开湿土，找到了一小段蠕动的虫体。');}else log('翻找了一阵，没有找到可收取的东西。');return r;
        }
        if(['observe','probe','nest','cast'].indexOf(key)>=0&&!reachable())return {ok:false,reason:'unreachable'};
        if(key==='observe'||key==='probe'){
            if(key==='probe'&&isLure())return {ok:false,reason:'floating_lure'};
            if(key==='probe'&&!rig())return {ok:false,reason:'rig_not_found'};
            if(key==='probe'){var probeLimit=castLimit();if(probeLimit)return {ok:false,reason:probeLimit};}
            r=pay(key);if(!r.ok)return r;var note=s.notes[s.point]||(s.notes[s.point]={});
            if(key==='probe'){note.bottom=C.points[s.point].bottom;note.bottomAt=clock();log(note.bottom);learnPart('fishing.sinker','probe');if(s.point===0){learn('depth','bottom-visible');learn('float','bottom-visible');}}
            else {note.fishAt=clock();note.fish=light()&&s.water[s.point].stock.some(function(n){return n>0;})?'水面偶有细碎波纹，尚不能确认来自什么。':'没有看见明确活动，不能据此确认水下是否有鱼。';log(note.fish);}return r;
        }
        if(key==='depth'){if(isLure())return {ok:false,reason:'floating_lure'};if(!Number.isInteger(value)||value<C.depth.min||value>C.depth.max)return {ok:false,reason:'invalid'};if(value>depthLimit())return {ok:false,reason:'depth_line_short'};if(value===s.depth)return {ok:true};r=pay('prepare');if(r.ok){s.depth=value;log('调整了线上的物件与末端之间的距离。');if(s.point===0&&light()){learn('depth','visible-adjust');learn('float','visible-adjust');learnPart('fishing.float','visible-adjust');}}return r;}
        if(key==='bait'||key==='nest'){
            if(key==='bait'&&isLure())return {ok:false,reason:'lure_not_baited'};
            var choice=carried().find(function(x){return x.item.instance_id===value&&C.bait[x.item.item_id];});if(!choice)return {ok:false,reason:'item'};
            if(!available(key==='bait'?'prepare':'nest'))return {ok:false,reason:'stamina'};
            if(key==='bait'){var hk=part('fishing.hook');if(!hk)return {ok:false,reason:'rig_not_found'};r=g.ItemAssembly.attachFromContainer(hk.instance_id,'bait',choice.type,choice.index);if(!r.ok)return r;pay('prepare');learn('item:'+choice.item.item_id,'attach');log('一份食物已挂在末端。');}
            else {r=IE().takeItemFromContainer(choice.type,choice.index);if(!r.success)return {ok:false,reason:'item'};pay('nest');var food=C.bait[choice.item.item_id].food,w=s.water[s.point],nest=w.nest[food];if(nest)nest.count=Math.min(20,nest.count+1);else w.nest[food]={count:1,at:clock()};w.disturbance=Math.min(3,w.disturbance+1);var nt=s.notes[s.point]||(s.notes[s.point]={});nt.nestAt=clock();log('一份食物落入选定水面，逐渐散开。');}return {ok:true};
        }
        if(key==='cast'){
            if(!ready())return {ok:false,reason:'busy'};
            var rigs=carried().filter(function(x){return g.ItemAssembly.getPartTypes(x.item).indexOf('fishing.rig_root')>=0;});var selected=(a&&a.rig_instance_id)||s.selectedRig||(rigs[0]&&rigs[0].item.instance_id);r=ensureSession(selected);if(!r.ok)return r;
            var limit=castLimit();if(limit)return {ok:false,reason:limit};
            if(isLure())FS().setDrag(s.drag);
            s.candidate=null;s.snag=0;r=FS().cast();if(r.ok){feedback();if(isLure()){s.retrieveLeft=C.lure.retrieve_ticks[s.lureSpeed];log('小物件落在水面，等着你摇柄牵动。');return r;}var pr=present();if(!obstacle())encounter(true);}return r;
        }
        if(key==='workLure'){
            if(!isLure()||!a||a.phase!=='waiting')return {ok:false,reason:'phase'};
            if(s.retrieveLeft<=0)return FS().finishLure();
            r=FS().lureStep(s.lureStyle,s.lureSpeed);if(!r.ok)return r;s.retrieveLeft--;
            learnPart('fishing.reel','wind');if(light())learnPart('fishing.lure','visible-movement');
            feedback();if(!obstacle())encounter(false);
            if(active().phase==='waiting'&&!s.snag&&s.retrieveLeft===0){FS().finishLure();log('小物件已收回岸边，这趟没有持续的拉扯。');}
            return r;
        }
        if(key==='wait'){
            if([1,3,6].indexOf(value)<0||s.snag)return {ok:false,reason:'invalid'};
            for(var j=0;j<value;j++){r=FS().waitTick();if(!r.ok)return r;encounter(false);if(active().phase!=='waiting')break;}if(active().phase==='waiting')feedback();return {ok:true};
        }
        if(key==='watch'){
            var c=s.candidate;if(!c||c.observed||!a||a.phase!=='signal')return {ok:false,reason:'phase'};c.observed=true;
            if(c.follow){c.inMouth=true;return FS().continueSignal(contactFor(c,true));}FS().continueSignal(null);loseCandidate();if(isLure()&&s.retrieveLeft===0)FS().finishLure();log('动静渐渐消失了。');return {ok:true};
        }
        if(key==='strike'){r=FS().strike(value);if(r.ok){feedback();if(!r.hooked)loseCandidate();}return r;}
        if(key==='fight'){
            r=FS().fightStep(value);if(r.ok){feedback();settle();if(active().phase==='fight'){var ct=active().contact,bi=ct.behavior_sequence[Math.min(ct.behavior_index-1,ct.behavior_sequence.length-1)];if(bi.id==='grass')obstacle();}}return r;
        }
        if(key==='snag'){
            if(!s.snag||['relax','pull'].indexOf(value)<0)return {ok:false,reason:'phase'};r=pay('snag');if(!r.ok)return r;
            if(value==='pull'){var loaded=FS().obstacleLoad(C.rules.snag_load[s.snag-1]);if(!loaded.ok)return loaded;if(loaded.broken){s.snag=0;settle();feedback();return loaded;}if(loaded.slipping){log('绕线处在放线，固定方向的阻力仍未松开。');return r;}}
            var odds=C.rules.snag_escape[value][s.snag-1];
            if(roll()*100<odds){s.snag=0;}else{s.snag=value==='relax'?1:2;}return r;
        }
        if(key==='retrieve'){if(s.snag)return {ok:false,reason:'snag'};r=FS().retrieve();if(r.ok){loseCandidate();feedback();}return r;}
        if(key==='cut'){r=FS().cutLine();if(r.ok){loseCandidate();s.snag=0;feedback();}return r;}
        if(key==='keep'||key==='release'){
            var catchData=s.candidate;if(!catchData||!catchData.landed||!a||a.phase!=='landed')return {ok:false,reason:'phase'};
            var item=catchData.item,age=Math.max(0,clock()-catchData.landedAt),limit=g.HideoutWarehouse.getSpoilageTicksFromTemplate(item.item_id);
            if(limit>0&&age>=limit){FS().resolveCatch('keep');s.candidate=null;log('留在岸边的鱼获已经腐坏，无法收取。');return {ok:true};}
            if(key==='keep'){IE().setItemInstanceValue(item,'spoilage_elapsed_ticks',age);var invBefore=clone(IE().getState());r=IE().putItemIntoDefaultContainer(item);if(!r.placed){IE().setState(invBefore);return {ok:false,reason:'space'};}}
            else s.water[s.point].stock[catchData.fish]++;
            FS().resolveCatch(key);loseCandidate();feedback();return {ok:true};
        }
        if(key==='close'){
            if(a&&a.phase==='landed')return {ok:false,reason:'pending'};
            if(a&&(a.phase==='fight'||s.snag)){r=FS().cutLine();if(!r.ok)return r;}
            else if(a&&(['waiting','signal'].indexOf(a.phase)>=0||a.needs_retrieval)){r=FS().retrieve();if(r.ok)recordFacts('retrieve',inspectFacts(true),true);if(!r.ok){if(r.reason!=='stamina')return r;r=FS().cutLine();if(!r.ok)return r;}}
            r=FS().close();if(r.ok){loseCandidate();s.snag=0;}return r;
        }
        return {ok:false,reason:'invalid'};
    }
    function grantStarter() {
        if(!C||s.starter)return {ok:true};initialize();var W=g.HideoutWarehouse,before=clone(W.getState()),invBefore=clone(IE().getState());
        function item(id){return IE().ensureItemInstanceIdentity({item_id:id,count:1},false);}
        var rod=item('fishing_rod_hand_basic'),line=item('fishing_line_main_nylon_thin'),leader=item('fishing_leader_nylon_basic');
        leader.connections={hook:item('fishing_hook_single_small')};line.connections={leader:leader,float:item('fishing_float_small'),sinker:item('fishing_sinker_fixed_1g')};rod.connections={main_line:line};
        var gifts=[rod,item('fishing_line_main_nylon_thin')];for(var i=0;i<3;i++)gifts.push(item('fishing_leader_nylon_basic'));for(i=0;i<5;i++)gifts.push(item('fishing_hook_single_small'));
        gifts.push({item_id:'fishing_bait_worm',count:10},{item_id:'fishing_bait_grain',count:5});
        for(i=0;i<gifts.length;i++){var r=W.depositFromInstance(gifts[i]);if(!r.ok||r.partial){W.setState(before);IE().setState(invBefore);return {ok:false,reason:'warehouse_full'};}}
        s.starter=true;return {ok:true};
    }
    function getPublicState() {
        if(!C)return null;var a=active(),note=s.notes[s.point]||{},c=s.candidate;
        return {observations:g.FishingFacts.create(C.fact_rules,s.factHistory).getPublicState(),needsRecovery:!!(a&&a.needs_retrieval),castLimit:a&&a.needs_retrieval?null:castLimit(),depthMax:a&&a.needs_retrieval?C.depth.max:depthLimit(),isLure:isLure(),lureStyle:s.lureStyle,lureSpeed:s.lureSpeed,drag:s.drag,station:s.station,point:s.point,depth:s.depth,knownDepth:knows('depth'),knownFloat:knows('float'),phase:a?a.phase:'ready',selectedRig:a?a.rig_instance_id:s.selectedRig,reachable:reachable(),snag:!!s.snag,canWatch:!!(c&&!c.observed),notes:clone(note),logs:clone(s.logs),light:light(),starter:s.starter,
            rigs:carried().filter(function(x){return g.ItemAssembly.getPartTypes(x.item).indexOf('fishing.rig_root')>=0;}).map(function(x){return {key:x.item.instance_id,name:name(x.item)};}),
            baits:carried().filter(function(x){return !!C.bait[x.item.item_id];}).map(function(x){return {key:x.item.instance_id,name:name(x.item),count:x.item.count||1};}),
            catchText:c&&c.landed?(knows('fish:'+C.fish[c.fish].id)?C.fish[c.fish].name:C.fish[c.fish].appearance):null};
    }
    function validate(x) {
        if(x==null)return true;if(!x||x.version!==1||!Number.isInteger(x.seed)||x.seed<0||x.seed>4294967295||!Number.isInteger(x.station)||x.station<0||x.station>2||!Number.isInteger(x.point)||x.point<0||x.point>4||!Number.isInteger(x.depth)||x.depth<2||x.depth>40)return false;
        if(x.feedbackHistory){try{g.FishingFeedback.create(C.feedback_rules,x.feedbackHistory);}catch(e){return false;}}
        if(x.lastFeedbackSignature!=null&&typeof x.lastFeedbackSignature!=='string')return false;
        if(x.factHistory){try{g.FishingFacts.create(C.fact_rules,x.factHistory);}catch(e){return false;}}
        if(x.attachedGrassHook!=null&&typeof x.attachedGrassHook!=='string')return false;
        if(x.attachedGrass!=null&&typeof x.attachedGrass!=='boolean'||x.previousLoad!=null&&(!Number.isInteger(x.previousLoad)||x.previousLoad<1))return false;
        if(!Array.isArray(x.water)||(x.initialized&&x.water.length!==5)||!x.notes||!x.knowledge||!Array.isArray(x.logs)||x.logs.length>12||!Number.isInteger(x.serial)||x.serial<0||[0,1,2].indexOf(x.snag)<0)return false;
        if(!x.water.every(function(w){return w&&Array.isArray(w.stock)&&(w.stock.length===3||C&&w.stock.length===C.fish.length)&&w.stock.every(function(n){return Number.isInteger(n)&&n>=0&&n<=100;})&&Number.isInteger(w.updated)&&w.updated>=0&&Number.isInteger(w.recovered)&&w.recovered>=0&&w.nest&&Object.keys(w.nest).every(function(k){var n=w.nest[k];return ['worm','grain'].indexOf(k)>=0&&Number.isInteger(n.count)&&n.count>=0&&n.count<=20&&Number.isInteger(n.at)&&n.at>=0;});}))return false;
        function integer(n){return Number.isInteger(n)&&n>=0;}
        if(x.lureStyle!=null&&['steady','pause','twitch'].indexOf(x.lureStyle)<0||x.lureSpeed!=null&&['slow','medium','fast'].indexOf(x.lureSpeed)<0||x.drag!=null&&['loose','medium','tight'].indexOf(x.drag)<0||x.retrieveLeft!=null&&(!integer(x.retrieveLeft)||x.retrieveLeft>4))return false;
        if(x.selectedRig!=null&&typeof x.selectedRig!=='string')return false;
        if(typeof x.initialized!=='boolean'||typeof x.starter!=='boolean'||!integer(x.gatherAt)||Array.isArray(x.notes)||Array.isArray(x.knowledge))return false;
        if(!x.water.every(function(w){return integer(w.disturbance)&&w.disturbance<=3;}))return false;
        if(!x.logs.every(function(l){return l&&integer(l.tick)&&typeof l.text==='string'&&l.text.length<1000;}))return false;
        if(!Object.keys(x.knowledge).every(function(k){var v=x.knowledge[k];return v&&typeof v.known==='boolean'&&Array.isArray(v.proofs)&&v.proofs.length<=2&&v.proofs.every(function(p){return typeof p==='string';});}))return false;
        var c=x.candidate;if(c&&(!Number.isInteger(c.fish)||c.fish<0||c.fish>=(C?C.fish.length:4)||!Number.isInteger(c.size)||c.size<0||c.size>2||!Number.isInteger(c.weight)||c.weight<=0||!Array.isArray(c.sequence)||c.sequence.length!==5||c.landed&&(!c.item||!c.item.item_id||!Number.isInteger(c.landedAt))))return false;
        if(c){
            if(!integer(c.serial)||c.serial>x.serial||!integer(c.length)||typeof c.inMouth!=='boolean'||typeof c.follow!=='boolean'||typeof c.observed!=='boolean'||typeof c.landed!=='boolean')return false;
            if(!c.sequence.every(function(b){return b&&typeof b.id==='string'&&Number.isInteger(b.load_delta)&&Number.isInteger(b.progress_delta)&&Number.isInteger(b.hook_delta);}))return false;
            if(c.landed&&(!integer(c.landedAt)||c.item.count!==1||typeof c.item.instance_id!=='string'||!c.item.fishing_catch||c.item.fishing_catch.weight_kg!==c.weight/1000||c.item.fishing_catch.length_cm!==c.length||C&&c.item.item_id!==C.fish[c.fish].id))return false;
        }
        return true;
    }
    function validateEnvelope(x,session){
        if(!validate(x))return false;
        var a=session&&session.active,c=x&&x.candidate;
        if(c){if(!a||a.point_id!=='pond:'+x.point||!a.contact||a.contact.event_id!=='pond:'+c.serial)return false;if(c.landed!==(a.phase==='landed'))return false;}
        if(a&&/^pond:[0-4]$/.test(a.point_id)&&['signal','fight','landed'].indexOf(a.phase)>=0&&!c)return false;
        return true;
    }
    function setState(x) { if(!validate(x))return false;s=x?clone(x):fresh();s.lureStyle=s.lureStyle||'steady';s.lureSpeed=s.lureSpeed||'medium';s.drag=s.drag||'medium';s.retrieveLeft=s.retrieveLeft||0;if(C&&s.initialized)s.water.forEach(function(w,i){while(w.stock.length<C.fish.length)w.stock.push(C.points[i].stocks[w.stock.length]);});return true; }
    g.FishingPond={configure:configure,setHost:function(x){hostOverride=x;},act:act,grantStarter:grantStarter,recognition:recognition,getPublicState:getPublicState,getState:function(){return clone(s);},setState:setState,validate:validate,validateEnvelope:validateEnvelope,isBusy:function(){return busy;}};
})(typeof window!=='undefined'?window:globalThis);
