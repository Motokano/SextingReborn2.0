/* Shared tick-driven environment. Internal facts are separate from observations. */
(function (g) {
    'use strict';
    var C = null, S = null, listener = null, lastObservation = null;
    var seasons = ['spring', 'summer', 'autumn', 'winter'];
    function copy(x) { return JSON.parse(JSON.stringify(x)); }
    function now() { return g.GameTime ? g.GameTime.getState().totalTicks : 0; }
    function finite(x) { return typeof x === 'number' && isFinite(x); }
    function approach(x, target, step) { return x + Math.max(-step, Math.min(step, target - x)); }
    function season(t) { return seasons[Math.floor((Math.floor(t / 144) % 360) / 90)]; }
    function random(r) { r.rng = (Math.imul(r.rng, 1664525) + 1013904223) >>> 0; return r.rng / 4294967296; }
    function duration(r, range) { return range[0] + Math.floor(random(r) * (range[1] - range[0] + 1)); }
    function seedFor(seed, id) { for (var i = 0; i < id.length; i++) seed = (Math.imul(seed, 31) + id.charCodeAt(i)) >>> 0; return seed; }
    function baseTemperature(region, t) {
        var day = (t / 144) % 360, pos = ((day - 45 + 360) % 360) / 90;
        var a = Math.floor(pos), f = pos - a, cfg = C.regions[region];
        return cfg.anchors[a] * (1 - f) + cfg.anchors[(a + 1) % 4] * f + cfg.daily_amplitude * Math.cos((t % 144 - 90) / 144 * Math.PI * 2);
    }
    function target(region, t) {
        var r = S.regions[region];
        return baseTemperature(region, t) + C.weather[r.weather].offset + C.event_offsets[r.event];
    }
    function choose(region, r, t, initial) {
        var ids = initial ? ['clear', 'cloudy', 'overcast'] : C.transitions[r.weather];
        var si = seasons.indexOf(season(t)), total = 0, rows = [];
        var temp = baseTemperature(region, t) + C.event_offsets[r.event];
        ids.forEach(function (id) {
            var w = C.weather[id];
            if (w.tags.indexOf('snow') >= 0 && (!C.regions[region].snow || temp > w.max_temperature)) return;
            var weight = w.weights[si];
            if (r.event === 'heatwave' && id === 'clear') weight *= 2;
            if (r.event === 'cold_snap' && (id === 'overcast' || w.tags.indexOf('snow') >= 0)) weight *= 2;
            if (weight > 0) { total += weight; rows.push([id, total]); }
        });
        var roll = random(r) * total;
        for (var i = 0; i < rows.length; i++) if (roll < rows[i][1]) return rows[i][0];
        return 'overcast';
    }
    function archive(r, tick) {
        r.history.push({start: r.phaseStart, end: tick, weather: r.weather, event: r.event});
        if (r.history.length > C.history_limit) r.history.shift();
        r.phaseStart = tick;
    }
    function initialize(t, seed) {
        lastObservation = null;
        S = {version: 1, seed: seed >>> 0, tick: t, regions: {}, maps: {}, effects: {}};
        Object.keys(C.regions).forEach(function (id) {
            var r = {rng: seedFor(S.seed, id), weather: 'clear', event: 'none', weatherUntil: t, eventUntil: t + C.event_check_ticks, phaseStart: t, history: [], temperature: 0};
            S.regions[id] = r;
            r.weather = choose(id, r, t, true);
            r.weatherUntil = t + duration(r, C.weather[r.weather].duration);
            r.temperature = target(id, t);
        });
    }
    function configure(c) {
        if (!c || c.version !== 1 || !c.regions[c.default_region] || !c.thermal) throw new Error('Invalid weather configuration');
        Object.keys(c.weather).forEach(function (id) {
            if (!c.transitions[id] || !c.transitions[id].every(function (n) { return !!c.weather[n]; })) throw new Error('Invalid weather transition: ' + id);
        });
        C = copy(c); initialize(now(), Math.floor(Math.random() * 4294967296));
    }
    function policy(map) {
        var id = map && (map.map_id || map.id) || '__unmapped';
        var p = Object.assign({}, C.maps[id] || {}, map && map.environment || {});
        if (map && finite(map.ambient_temperature) && p.temperature == null) p.temperature = map.ambient_temperature;
        if (map && map.ambient_temperature_by_season && !p.temperature_by_season) p.temperature_by_season = copy(map.ambient_temperature_by_season);
        p.region = p.region || C.default_region;
        if (!C.regions[p.region]) throw new Error('Unknown climate region: ' + p.region);
        if (p.weather != null && p.weather !== 'none' && !C.weather[p.weather]) throw new Error('Unknown map weather');
        return {id: String(id), policy: p};
    }
    function mapTarget(m, t) {
        var p = m.policy, r = S.regions[p.region];
        var v = finite(p.temperature) ? p.temperature : (p.temperature_by_season && finite(p.temperature_by_season[season(t)]) ? p.temperature_by_season[season(t)] : r.temperature);
        v += Number(p.temperature_offset) || 0;
        Object.keys(S.effects).forEach(function (key) { var e = S.effects[key]; if (e.map === m.id && (e.until == null || t <= e.until)) v += e.offset; });
        return v;
    }
    function sync(t) {
        if (!C) return;
        t = Math.max(0, Math.floor(t));
        if (t < S.tick) throw new Error('Restore weather state before querying a rewound clock');
        for (var at = S.tick + 1; at <= t; at++) {
            Object.keys(S.regions).forEach(function (id) {
                var r = S.regions[id], oldW = r.weather, oldE = r.event;
                if (at >= r.eventUntil) {
                    if (r.event !== 'none') { r.event = 'none'; r.eventUntil = at + C.event_check_ticks; }
                    else if (random(r) < C.event_chance[season(at)]) {
                        r.event = season(at) === 'summer' ? 'heatwave' : season(at) === 'winter' ? 'cold_snap' : (random(r) < 0.5 ? 'heatwave' : 'cold_snap');
                        r.eventUntil = at + duration(r, C.event_duration);
                    } else r.eventUntil = at + C.event_check_ticks;
                }
                if (at >= r.weatherUntil) { r.weather = choose(id, r, at, false); r.weatherUntil = at + duration(r, C.weather[r.weather].duration); }
                if (oldW !== r.weather || oldE !== r.event) {
                    var newW = r.weather, newE = r.event; r.weather = oldW; r.event = oldE; archive(r, at); r.weather = newW; r.event = newE;
                }
                r.temperature = approach(r.temperature, target(id, at), C.temperature_step);
            });
            Object.keys(S.maps).forEach(function (id) {
                var m = S.maps[id], p = m.policy;
                // Ordinary maps share the exact regional value, without a second lag.
                m.temperature = (finite(p.temperature) || p.temperature_by_season || m.transient)
                    ? approach(m.temperature, mapTarget(m, at), C.temperature_step) : mapTarget(m, at);
            });
            Object.keys(S.effects).forEach(function (key) { if (S.effects[key].until != null && at > S.effects[key].until) delete S.effects[key]; });
            S.tick = at;
        }
    }
    function temperatureBand(value) {
        if (!C || !finite(value)) return null;
        var bands = C.temperature_bands || [];
        for (var i = 0; i < bands.length; i++) if (bands[i].below == null || value < bands[i].below) return bands[i].id;
        return null;
    }
    function environment(map) {
        if (!C) return null;
        sync(now());
        var x = policy(map), m = S.maps[x.id];
        if (!m) { m = {id: x.id, policy: x.policy, temperature: 0}; S.maps[x.id] = m; m.temperature = mapTarget(m, S.tick); }
        else m.policy = x.policy;
        var r = S.regions[x.policy.region], w = x.policy.weather != null ? x.policy.weather : r.weather;
        return {map: x.id, region: x.policy.region, tick: S.tick, season: season(S.tick), weather: w, tags: w === 'none' ? [] : C.weather[w].tags.slice(), event: (finite(x.policy.temperature) || x.policy.temperature_by_season) ? 'none' : r.event, temperature: m.temperature, temperature_band: temperatureBand(m.temperature), observable: x.policy.observable !== false && w !== 'none'};
    }
    function matches(condition, map) {
        var e = environment(map); if (!e) return false;
        return (!condition.season || condition.season === e.season) && (!condition.weather || condition.weather === e.weather) && (!condition.tag || e.tags.indexOf(condition.tag) >= 0) && (!condition.event || condition.event === e.event) && (condition.min_temperature == null || e.temperature >= condition.min_temperature) && (condition.max_temperature == null || e.temperature <= condition.max_temperature);
    }
    function observe(map) { var e = environment(map); return e && e.observable ? {map: e.map, tick: e.tick, weather: e.weather, label: C.weather[e.weather].label, text: C.weather[e.weather].text} : null; }
    function valid(s, tick) {
        if (!s) return true; // Legacy snapshots have no weather; initialize once at their restored tick.
        if (!C || s.version !== 1 || s.tick !== tick || !s.regions || !s.maps || !s.effects || !finite(s.seed)) return false;
        return Object.keys(C.regions).every(function (id) {
            var r = s.regions[id];
            return r && finite(r.rng) && C.weather[r.weather] && Object.prototype.hasOwnProperty.call(C.event_offsets, r.event) && finite(r.temperature) && r.weatherUntil > tick && r.eventUntil > tick && Array.isArray(r.history) && r.history.length <= C.history_limit;
        }) && Object.keys(s.maps).every(function (id) { var m = s.maps[id]; return m && m.id === id && m.policy && C.regions[m.policy.region] && finite(m.temperature) && (m.policy.weather == null || m.policy.weather === 'none' || C.weather[m.policy.weather]); }) && Object.keys(s.effects).every(function (k) { var e = s.effects[k]; return e && typeof e.map === 'string' && finite(e.offset) && (e.until == null || finite(e.until)); });
    }
    function restore(s, tick) { if (!valid(s, tick)) throw new Error('Invalid weather snapshot'); lastObservation = null; if (s) S = copy(s); else initialize(tick, seedFor(20260924, String(tick))); }
    function publishObservation() {
        if (!C || !g.GameEngine || !g.GameEngine.getMap) return;
        var o = observe(g.GameEngine.getMap());
        if (o && lastObservation && (o.map !== lastObservation.map || o.weather !== lastObservation.weather) && listener) listener(o.text);
        lastObservation = o;
        if (g.document) { var el = g.document.getElementById('hud-weather'); if (el) {var measured=g.NPCSystem&&g.NPCSystem.isDemoFlagTrue('observation_temperature_unlocked'),env=measured?environment(g.GameEngine.getMap()):null;el.textContent=(o?o.label:'')+(env?' · '+Math.round(env.temperature)+'℃':'');} }
    }
    function setMapEffect(source, map, effect) {
        if (!source) throw new Error('Environment effect source required');
        var e = environment(map);
        if (!effect) { delete S.effects[source]; return; }
        if (!finite(effect.offset)) throw new Error('Finite temperature offset required');
        S.maps[e.map].transient = true;
        S.effects[source] = {map: e.map, offset: effect.offset, until: effect.ticks == null ? null : S.tick + Math.max(1, Math.floor(effect.ticks))};
        if (effect.immediate) S.maps[e.map].temperature = mapTarget(S.maps[e.map], S.tick);
    }
    g.Weather = {
        configure: configure, isReady: function () { return !!C; }, sync: sync,
        getEnvironment: environment, matches: matches, observe: observe,
        getThermalConfig: function () { return C ? copy(C.thermal) : null; },
        getState: function () { if (!C) return null; sync(now()); return copy(S); },
        validate: valid, restore: restore, reset: function (seed) { if (C) initialize(now(), seed == null ? Math.floor(Math.random() * 4294967296) : seed); },
        setMapEffect: setMapEffect,
        publishObservation: publishObservation,
        subscribe: function (fn) { listener = fn; }, notify: function (text) { if (listener) listener(text); },
        getHistory: function (region) { if (!C) return []; sync(now()); var r = S.regions[region]; return r ? copy(r.history.concat([{start:r.phaseStart,end:S.tick,weather:r.weather,event:r.event}])) : []; }
    };
})(typeof window !== 'undefined' ? window : this);
