/* Hunting state machine. All costs, time and rewards pass through the host adapter. */
(function (global) {
    'use strict';
    var config = null, host = null, busy = false;
    var state = { version: 1, points: {}, active: null, successes: 0 };
    function clone(x) { return JSON.parse(JSON.stringify(x)); }
    function isActive() { return !!state.active; }
    function now() { return host ? host.now() : 0; }
    function configure(c, h) { config = c; host = h; }
    function ready() { return !!(config && host); }
    function learning(){return !!(global.HuntingKnowledge && config && config.learning);}
    function knows(id){return !learning() || global.HuntingKnowledge.knows(state.knowledge || {},id);}
    function visible(id){return !learning() || (config.learning.gates[id] || []).every(knows);}
    function evidence(id){if(learning())global.HuntingKnowledge.record(state.knowledge,config.learning.knowledge,id,state.active.huntId,state.active.key);}
    function xp(kind){var n=(config.learning && config.learning.xp[kind]) || (kind==='success'?3:1);if(host.addProficiency)host.addProficiency(n);if(state.active)state.active.lastXp=(state.active.lastXp||0)+n;}
    function fail(reason) { return { ok: false, reason: reason }; }
    function random(p) {
        p.seed = (Math.imul(p.seed, 1664525) + 1013904223) >>> 0;
        return p.seed / 4294967296;
    }
    function point(key, pool) {
        if (!state.points[key]) state.points[key] = { seed: (Math.random() * 4294967296) >>> 0, readyAt: 0, event: null };
        var p = state.points[key];
        if (!p.event) {
            var available = (pool || ['rabbit']).filter(function (id) { return !!config.events[id]; });
            if (!available.length) available = ['rabbit'];
            p.event = available[Math.floor(random(p) * available.length)];
        }
        return p;
    }
    function inspect(key, pool) {
        if (!ready()) return null;
        var p = point(key, pool);
        return { event: p.event, remaining: Math.max(0, p.readyAt - now()) };
    }
    function start(key, pool) {
        if (!ready()) return fail('unavailable');
        if (busy || isActive()) return fail('active');
        if (!host.canStart(key)) return fail('busy');
        var p = point(key, pool);
        if (p.readyAt > now()) return fail('cooldown');
        state.active = { key: key, event: p.event, phase: 'prepare', elapsed: 0, flags: {},
            shelter: clone(config.shelter_positions[Math.floor(random(p)*config.shelter_positions.length)]),
            target: config.events[p.event].species ? null : 'meat', last: 'hunting.started', reward: null };
        var variants = config.events[p.event].variants || [];
        if (variants.length) state.active.variant = variants[Math.floor(random(p)*variants.length)];
        if(learning()){
            state.knowledge=state.knowledge || {};state.huntSerial=(state.huntSerial||0)+1;state.active.huntId=state.huntSerial;
            if(p.oldRope==null)p.oldRope=random(p)<config.learning.rope_chance;
        }
        changed();
        return { ok: true };
    }
    function changed() { if (host && host.changed) host.changed(); }
    function finish(result) {
        var a = state.active;
        if (!a) return;
        var p = state.points[a.key];
        if(a.phase!=='survey')p.readyAt = now() + config.cooldown_ticks;
        p.event = null;
        a.phase = 'ended'; a.last = 'hunting.result.' + result;
        if(learning() && ['escaped','herd_escaped','calf_protected','chicks_hidden'].indexOf(result)>=0){
            a.phase='survey';
            if(a.captureFailed){a.flags.escape_seen=true;evidence('escape_gap');if(config.events[a.event].strength)evidence('cattle_escape');}
        }
    }
    function chance(id) {
        var a = state.active, act = getAction(id);
        if (!a || !act || act.chance == null) return null;
        if (['observe','counter','air_javelin','wait_land','intercept','brace','look','inspect_gap','practice_knot'].indexOf(id) >= 0) return act.chance;
        var bonus = id.indexOf('retry_') === 0 ? 0 : (a.flags.observe ? 0.10 : 0) + (a.flags.bait ? 0.20 : 0);
        var penalty = config.events[a.event].herd && !a.flags.bait ? 0.10 : 0;
        if(config.events[a.event].strength && ['hands','net'].indexOf(id)>=0)penalty+=0.10;
        if(a.flags.bait && id.indexOf('retry_')!==0)bonus+=getVariant().bait_bonus || 0;
        if(learning() && ['hands','net','snare','javelin'].indexOf(id)>=0)bonus+=Math.min(.08,Math.max(0,((host.level?host.level():1)-1)*.002));
        if(id==='snare' && !knows('snare_placement'))penalty+=.15;
        return Math.max(0,Math.min(0.95, act.chance + bonus - penalty));
    }
    function getAction(id) {
        if (id.indexOf('process_') === 0) {
            var a=state.active, e=a && config.events[a.event];
            return e && e.processing && e.processing[id.slice(8)];
        }
        var base=config.actions[id];
        if(!base)return base;
        var action=Object.assign({},base), modifier=(getVariant().actions || {})[id];
        if(modifier) {
            if(modifier.chance!=null)action.chance=Math.max(0,Math.min(.95,action.chance+modifier.chance));
            if(modifier.stamina!=null)action.stamina+=modifier.stamina;
            if(modifier.ticks!=null)action.ticks+=modifier.ticks;
        }
        return action;
    }
    function getVariant() { return config && state.active && config.variants && config.variants[state.active.variant] || {}; }
    function reason(id) {
        var a = state.active;
        if (!a) return 'inactive';
        if (busy) return 'busy';
        if(!visible(id))return 'knowledge';
        if (a.phase === 'ended') return id === 'close' ? null : 'ended';
        if(id==='close' && a.phase==='survey')return null;
        if (id === 'abandon') return null;
        if (id === 'leave') return a.phase === 'processing' ? null : 'phase';
        if (!host.canContinue(a.key)) return 'interrupted';
        var investigation=['inspect_gap','inspect_rope','probe_rope','practice_knot','inspect_trap'];
        if(a.phase==='survey' || investigation.indexOf(id)>=0 || id==='inspect_carcass'){
            if(!learning())return 'phase';
            if(id==='inspect_carcass'){if(a.phase!=='processing')return 'phase';}
            else if(a.phase!=='survey' || investigation.indexOf(id)<0)return 'phase';
            if(a.flags[id])return 'done';
            if(id==='inspect_gap' && !a.flags.escape_seen)return 'phase';
            if(id==='inspect_rope' && !a.flags.rope_found)return 'phase';
            if(id==='probe_rope' && !a.flags.inspect_rope)return 'phase';
            if(id==='practice_knot' && (!a.flags.probe_rope || !knows('snare_tightening')))return 'phase';
            if(id==='inspect_trap' && !(a.trapChance!=null||a.flags.set_intercept||a.flags.set_tether))return 'phase';
            var ia=getAction(id);if(ia.stamina>host.stamina()||!host.canSpend())return 'stamina';
            if(ia.item&&host.count(ia.item)<1)return 'item';return null;
        }
        if(id==='look' && (!learning() || a.phase!=='prepare'))return 'phase';
        if (id === 'meat' || id === 'juvenile') return !a.target && a.phase === 'prepare' && config.events[a.event].species ? null : 'phase';
        if (!a.target) return 'target';
        var boar = !!config.events[a.event].counterattack;
        var bird = !!config.events[a.event].startles;
        var herd = !!config.events[a.event].herd;
        var cattle = !!config.events[a.event].strength;
        if ((boar || bird || herd || cattle) && id === 'block') return 'phase';
        if ((herd || cattle) && id === 'snare') return 'phase';
        if(id==='set_tether' && (!cattle || a.phase!=='prepare'))return 'phase';
        if(id==='set_tether' && a.target==='juvenile')return 'calf_tether';
        if(a.phase==='straining' && id!=='brace')return 'straining';
        if(a.phase!=='straining' && id==='brace')return 'phase';
        if (id === 'set_intercept' && (!herd || a.phase !== 'prepare')) return 'phase';
        if (a.phase === 'herd_alert' && id !== 'intercept') return 'herd_alert';
        if (a.phase !== 'herd_alert' && id === 'intercept') return 'phase';
        if (a.phase === 'airborne' && ['air_javelin','wait_land'].indexOf(id) < 0) return 'airborne';
        if (a.phase !== 'airborne' && ['air_javelin','wait_land'].indexOf(id) >= 0) return 'phase';
        if (a.phase === 'charge' && ['hide','counter','retreat'].indexOf(id) < 0) return 'charge';
        if (a.phase !== 'charge' && ['hide','counter','retreat'].indexOf(id) >= 0) return 'phase';
        if (id === 'retreat') return null;
        if (id === 'rest') return null;
        if (a.phase === 'processing' && id.indexOf('process_') !== 0) return 'phase';
        if (a.phase !== 'processing' && id.indexOf('process_') === 0) return 'phase';
        if (a.phase === 'waiting') return 'waiting';
        if (a.phase === 'retry' && id.indexOf('retry_') !== 0) return 'phase';
        if (a.phase === 'prepare' && id.indexOf('retry_') === 0) return 'phase';
        var act = getAction(id);
        if (!act) return 'unknown';
        if (a.flags[id]) return 'done';
        if ((id === 'block' || (id === 'snare' && (!learning() || knows('animal_regular_path')))) && !a.flags.observe) return 'observe';
        if (id === 'hide' && !a.flags.observe && !a.flags.coverLocated) return 'observe';
        if (id === 'wait_land' && !a.flags.observe) return 'landing';
        if (id === 'set_intercept' && !a.flags.observe) return 'passage';
        if (id === 'set_tether' && !a.flags.observe) return 'passage';
        if(id==='bait' && getVariant().bait_needs_observe && knows('animal_regular_path') && !a.flags.observe)return 'approach';
        if ((id === 'javelin' || id === 'counter') && a.target === 'juvenile') return 'live';
        if (boar && a.target === 'juvenile' && ['hands','net','snare'].indexOf(id) >= 0 && !a.flags.bait) return 'mother';
        if (bird && a.target === 'juvenile' && ['hands','net','snare'].indexOf(id) >= 0 && !a.flags.bait) return 'hen';
        if (herd && a.target === 'juvenile' && ['hands','net','retry_hands','retry_net'].indexOf(id) >= 0 && !a.flags.bait) return 'separate';
        if(cattle && a.target==='juvenile' && ['hands','net','retry_hands','retry_net'].indexOf(id)>=0 && !a.flags.bait)return 'cow';
        if (act.stamina > host.stamina() || !host.canSpend()) return 'stamina';
        if (act.item && host.count(act.item) < 1) return 'item';
        return null;
    }
    function tick(n, rest) {
        var a = state.active;
        for (var i = 0; i < n; i++) {
            host.tick(rest); a.elapsed++;
            if (!host.canContinue(a.key)) { finish('interrupted'); return false; }
        }
        return true;
    }
    function caught(id, rollChance) {
        var a = state.active, p = state.points[a.key], event = config.events[a.event];
        var success=random(p)<rollChance;xp(success?'success':'failure');
        if(!success)a.captureFailed=true;
        if (success) {
            var reward = { item_id: a.target === 'juvenile' ? event.juvenile_item : event.reward, count: a.target === 'juvenile' ? 1 : (event.reward_count || 1) };
            if (a.target === 'juvenile') reward.hunting_juvenile = host.makeJuvenile(event.species);
            a.reward = clone(reward);
            host.grant(reward); state.successes++;
            if (a.target === 'meat' && event.processing && Object.keys(event.processing).length) {
                a.phase='processing';a.last='hunting.processing_started';a.extraRewards=[];
            } else finish('caught');
        } else if (event.strength) {
            if(a.target==='juvenile')finish('calf_protected');
            else if(a.flags.set_tether && !a.flags.tether_used){a.phase='straining';a.last='hunting.cattle_straining';}
            else finish('escaped');
        } else if (event.herd) {
            if (a.flags.set_intercept && !a.flags.intercept_used) {
                a.phase = 'herd_alert'; a.last = 'hunting.herd_alert';
            } else finish('herd_escaped');
        } else if (event.startles) {
            if (a.target === 'juvenile') finish('chicks_hidden');
            else if (a.flags.flushed) finish('escaped');
            else { a.flags.flushed = true; a.phase = 'airborne'; a.last = 'hunting.bird_flushed'; }
        } else if (event.counterattack) {
            if (a.flags.charged) {
                host.spend(Math.min(host.stamina(), event.counterattack.exhaustion));
                finish('driven_off');
            } else {
                a.flags.charged = true; a.phase = 'charge'; a.last = 'hunting.boar_charge';
            }
        } else if (a.flags.block && a.phase !== 'retry') {
            a.phase = 'retry'; a.last = 'hunting.missed_retry';
        } else finish('escaped');
    }
    function act(id) {
        var why = reason(id);
        if (why) return fail(why);
        busy = true;
        try {
            var a = state.active;
            a.lastXp=0;
            if (id === 'close') { state.active = null; return { ok: true }; }
            if(id==='abandon' && a.phase==='survey'){state.active=null;return {ok:true};}
            if (id === 'retreat' || (id === 'abandon' && a.phase === 'charge')) {
                host.spend(Math.min(host.stamina(), config.actions.retreat.stamina));
                if (tick(config.actions.retreat.ticks, false)) finish('retreated');
                return { ok: true };
            }
            if (id === 'abandon' || id === 'leave') { finish(a.phase==='processing'?'caught':'abandoned'); return { ok: true }; }
            if (id === 'meat' || id === 'juvenile') { a.target = id; return { ok: true }; }
            if (id === 'rest') {
                if (a.phase === 'processing') { if(tick(config.rest_ticks,true))a.last='hunting.processing_rest'; }
                else if (a.phase === 'retry') { if (tick(config.rest_ticks, true)) finish('escaped'); }
                else if (a.phase === 'waiting') {
                    var n = Math.min(config.rest_ticks, a.waitRemaining);
                    if (tick(n, true)) {
                        a.waitRemaining -= n;
                        if (a.waitRemaining <= 0) caught('snare', a.trapChance);
                    }
                } else if (tick(config.rest_ticks, true)) {
                    a.last = 'hunting.rested'; checkDeadline();
                }
                return { ok: true };
            }
            var action = getAction(id), p = chance(id);
            if (action.item && !host.consume(action.item, 1)) return fail('item');
            host.spend(action.stamina);
            if (!tick(action.ticks, false)) {xp('failure');return { ok: true };}
            if(['look','inspect_gap','inspect_rope','probe_rope','practice_knot','inspect_trap','inspect_carcass'].indexOf(id)>=0){
                var success=action.chance==null || random(state.points[a.key])<p;
                xp(action.chance==null?'practice':success?'success':'failure');
                a.flags[id]=true;a.last='hunting.learning.'+id+(success?'':'_failed');
                if(success){
                    if(id==='look'){evidence('cover_noticed');if(knows('cover_use'))a.flags.coverLocated=true;if(config.events[a.event].startles)evidence('bird_watched');}
                    if(id==='inspect_gap'){evidence('repeated_tracks');if(state.points[a.key].oldRope){a.flags.rope_found=true;a.last='hunting.learning.rope_found';}}
                    if(id==='probe_rope')evidence('loop_tightened');
                    if(id==='practice_knot')evidence('anchor_tested');
                    if(id==='inspect_trap')evidence('trap_examined');
                    if(id==='inspect_carcass')evidence('carcass_examined');
                }
                if(id==='look')checkDeadline();
                return {ok:true};
            }
            if(action.chance==null)xp('practice');
            if (id.indexOf('process_') === 0) {
                a.flags[id]=true;
                var part={item_id:action.reward,count:action.count};
                a.extraRewards.push(clone(part));host.grant(part);a.last='hunting.processed';
                if(Object.keys(config.events[a.event].processing).every(function(k){return a.flags['process_'+k];}))finish('caught');
            } else if (id === 'set_tether') {
                a.flags.set_tether=true;a.last='hunting.tether_set';checkDeadline();
            } else if(id==='brace') {
                a.flags.tether_used=true;caught(id,p);
            } else if (id === 'set_intercept') {
                a.flags.set_intercept = true; a.last = 'hunting.intercept_set'; checkDeadline();
            } else if (id === 'intercept') {
                a.flags.intercept_used = true; caught(id,p);
            } else if (id === 'wait_land') {
                var landed=random(state.points[a.key])<p;xp(landed?'success':'failure');
                if (landed) {
                    a.phase = 'retry'; a.flags.landed = true; a.last = 'hunting.bird_landed';
                } else finish('escaped');
            } else if (id === 'hide') {
                a.flags.hide = true; a.phase = 'retry'; a.last = 'hunting.boar_hidden';
            } else if (id === 'observe') {
                var observed=random(state.points[a.key])<p;xp(observed?'success':'failure');
                if (observed) {
                    evidence('cover_noticed');if(config.events[a.event].startles)evidence('bird_watched');
                    a.flags.observe = true; a.last = config.events[a.event].startles ? 'hunting.bird_observed' : 'hunting.prepared.observe';
                    if(config.events[a.event].herd)a.last='hunting.herd_observed';
                    if(config.events[a.event].strength)a.last='hunting.cattle_observed';
                } else a.last = 'hunting.observe_failed';
                checkDeadline();
            } else if (id === 'block' || id === 'bait') {
                a.flags[id] = true;
                a.last = config.events[a.event].counterattack && id === 'bait' && a.target === 'juvenile' ? 'hunting.mother_lured' : 'hunting.prepared.' + id;
                if (config.events[a.event].startles && id === 'bait' && a.target === 'juvenile') a.last = 'hunting.hen_lured';
                if (config.events[a.event].herd && id === 'bait') a.last = 'hunting.sheep_separated';
                if(config.events[a.event].strength && id==='bait')a.last=a.target==='juvenile'?'hunting.cow_lured':'hunting.cattle_separated';
                checkDeadline();
            } else if (id === 'snare') {
                xp('practice');
                a.phase = 'waiting'; a.trapChance = p; a.waitRemaining = config.trap_wait_ticks; a.last = 'hunting.waiting';
            } else caught(id, p);
            return { ok: true };
        } finally { busy = false; changed(); }
    }
    function checkDeadline() {
        var a = state.active;
        if (a.elapsed >= (getVariant().window_ticks || config.window_ticks) + (a.flags.bait ? config.bait_extension_ticks : 0)) finish('escaped');
    }
    function getState() { return clone(state); }
    function validate(s) {
        if (s == null) return true;
        if (s.version !== 1 || !s.points || typeof s.points !== 'object' || Array.isArray(s.points)) return false;
        if(learning() && (!global.HuntingKnowledge.validate(s.knowledge,config.learning.knowledge) || (s.huntSerial!=null && (!Number.isSafeInteger(s.huntSerial)||s.huntSerial<0))))return false;
        for (var k in s.points) {
            var p = s.points[k];
            if (!p || !Number.isInteger(p.seed) || p.seed < 0 || p.seed > 4294967295 || !Number.isFinite(p.readyAt) || p.readyAt < 0) return false;
            if (p.event != null && (!config || !config.events[p.event])) return false;
        }
        var a = s.active;
        return !a || !!(config && config.events[a.event] && s.points[a.key] &&
            ['prepare','waiting','retry','charge','airborne','herd_alert','straining','processing','survey','ended'].indexOf(a.phase) >= 0 &&
            (a.huntId==null || (Number.isSafeInteger(a.huntId)&&a.huntId>=0&&a.huntId<=(s.huntSerial||0))) &&
            (a.variant == null || (config.variants && config.variants[a.variant] && (config.events[a.event].variants || []).indexOf(a.variant)>=0)) &&
            (a.phase!=='straining' || (config.events[a.event].strength && a.flags && a.flags.set_tether && !a.flags.tether_used && !a.reward && a.target==='meat')) &&
            (a.phase !== 'herd_alert' || (config.events[a.event].herd && a.flags && a.flags.set_intercept && !a.flags.intercept_used && !a.reward && a.target && (a.target !== 'juvenile' || a.flags.bait))) &&
            (a.phase !== 'airborne' || (config.events[a.event].startles && a.flags && a.flags.flushed && !a.reward && a.target === 'meat')) &&
            (a.phase !== 'charge' || (config.events[a.event].counterattack && a.flags && a.flags.charged && !a.reward && a.target)) &&
            (a.phase !== 'processing' || (a.target === 'meat' && a.reward && Array.isArray(a.extraRewards) && config.events[a.event].processing)) &&
            [null,'meat','juvenile'].indexOf(a.target) >= 0 &&
            (a.target !== 'juvenile' || config.events[a.event].species) &&
            Number.isFinite(a.elapsed) && a.elapsed >= 0 && a.flags && typeof a.flags === 'object' &&
            (a.shelter == null || (Array.isArray(a.shelter) && a.shelter.length === 2 && Number.isFinite(a.shelter[0]) && a.shelter[0]>=40 && a.shelter[0]<=500 && Number.isFinite(a.shelter[1]) && a.shelter[1]>=40 && a.shelter[1]<=300)) &&
            (a.phase !== 'waiting' || (Number.isFinite(a.waitRemaining) && a.waitRemaining > 0 && a.waitRemaining <= config.trap_wait_ticks && Number.isFinite(a.trapChance) && a.trapChance >= 0 && a.trapChance <= 0.95)));
    }
    function setState(s) {
        if (!validate(s)) return false;
        state = s ? clone(s) : { version: 1, points: {}, active: null, successes: 0 };
        if(learning()){state.knowledge=state.knowledge || {};state.huntSerial=state.huntSerial||0;if(state.active && state.active.huntId==null){state.huntSerial++;state.active.huntId=state.huntSerial;}}
        // Upgrade older active saves deterministically, without rerolling their action RNG.
        if (state.active && !state.active.shelter) {
            state.active.shelter = clone(config.shelter_positions[state.points[state.active.key].seed % config.shelter_positions.length]);
        }
        changed(); return true;
    }
    global.Hunting = { configure: configure, ready: ready, inspect: inspect, start: start, act: act,
        reason: reason, chance: chance, isActive: isActive, getState: getState, setState: setState,
        validate: validate, getAction: getAction, getVariant: getVariant, knows:knows, visible:visible, isBusy: function () { return busy; }, getConfig: function () { return config; } };
})(typeof window !== 'undefined' ? window : globalThis);
