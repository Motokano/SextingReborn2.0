/* Reusable fact ledger: producers record events; perception is fixed at event time.
   No text selection, random draws, time advancement, or hidden-state public projection. */
(function(g){
    'use strict';
    var copy=function(x){return JSON.parse(JSON.stringify(x));};
    function validateConfig(c){
        if(!c||c.schema_version!==1||!Number.isInteger(c.history_limit)||c.history_limit<1||!c.facts||!Array.isArray(c.exclusive)||!Array.isArray(c.source_types))throw Error('fishing facts: invalid config');
        Object.keys(c.facts).forEach(function(k){var d=c.facts[k];if(!Array.isArray(d.channels)||!d.channels.length||!d.channels.every(function(ch){return ['visual','touch','inspection','sound'].includes(ch);}))throw Error('fishing facts: invalid channels '+k);});
        c.exclusive.forEach(function(pair){if(pair.length<2||pair.some(function(k){return !c.facts[k];}))throw Error('fishing facts: invalid exclusive set');});
        if(!Array.isArray(c.visual_hours)||c.visual_hours.length!==2||!c.visual_hours.every(function(h){return Number.isInteger(h)&&h>=0&&h<=24;})||c.visual_hours[0]>=c.visual_hours[1]||!Number.isInteger(c.wear_visible_at)||c.wear_visible_at<0)throw Error('fishing facts: invalid perception thresholds');
        function factList(list){if(!Array.isArray(list)||!list.every(function(f){return !!c.facts[f];}))throw Error('fishing facts: unresolved profile fact');}
        if(!c.strike_profiles||!c.signal_profiles||!Array.isArray(c.contact_signals)||!c.contact_signals.length)throw Error('fishing facts: missing producer profiles');
        ['miss','brief','hooked'].forEach(function(k){factList(c.strike_profiles[k]);});Object.values(c.signal_profiles).forEach(factList);
        var signalIds=new Set();c.contact_signals.forEach(function(p){if(!p.id||signalIds.has(p.id)||!Number.isInteger(p.weight)||p.weight<0)throw Error('fishing facts: invalid signal');signalIds.add(p.id);factList(p.facts);});
        if(!c.contact_signals.some(function(p){return p.weight>0;}))throw Error('fishing facts: empty signal weights');
        return true;
    }
    function create(c,saved){
        validateConfig(c);c=copy(c);
        var s=saved?copy(saved):{version:1,serial:0,events:[]};
        function valid(x){
            if(!x||x.version!==1||!Number.isInteger(x.serial)||x.serial<0||!Array.isArray(x.events)||x.events.length>c.history_limit)return false;
            var ids=new Set();return x.events.every(function(e){
                if(!e||typeof e.id!=='string'||ids.has(e.id)||!c.source_types.includes(e.source)||!Number.isInteger(e.tick)||e.tick<0||typeof e.water!=='string'||typeof e.point!=='string'||!Array.isArray(e.actual)||!Array.isArray(e.perceived)||!Array.isArray(e.channels))return false;
                ids.add(e.id);return e.actual.every(function(f){return !!c.facts[f];})&&e.channels.every(function(ch){return ['visual','touch','inspection','sound'].includes(ch);})&&e.perceived.every(function(f){return e.actual.includes(f)&&c.facts[f].channels.some(function(ch){return e.channels.includes(ch);});})&&!c.exclusive.some(function(pair){return pair.filter(function(f){return e.actual.includes(f);}).length>1;});
            });
        }
        if(!valid(s))throw Error('fishing facts: invalid save');
        function record(e){
            if(!e||!Array.isArray(e.actual)||!Array.isArray(e.channels))throw Error('fishing facts: missing evidence');
            var entry={id:e.water+':'+(s.serial+1),source:e.source,tick:e.tick,water:e.water,point:e.point,actual:Array.from(new Set(e.actual)),channels:Array.from(new Set(e.channels)),perceived:[]};
            entry.perceived=entry.actual.filter(function(f){if(!c.facts[f])throw Error('fishing facts: unregistered '+f);return c.facts[f].channels.some(function(ch){return entry.channels.includes(ch);});});
            var next={version:1,serial:s.serial+1,events:s.events.concat(entry).slice(-c.history_limit)};
            if(!valid(next))throw Error('fishing facts: contradictory or invalid event');s=next;return publicEvent(entry);
        }
        function publicEvent(e){return {id:e.id,source:e.source,tick:e.tick,water:e.water,point:e.point,facts:e.perceived.slice(),channels:e.channels.slice()};}
        return {record:record,getState:function(){return copy(s);},getPublicState:function(){return s.events.map(publicEvent);}};
    }
    g.FishingFacts={validateConfig:validateConfig,create:create};
})(typeof window!=='undefined'?window:globalThis);
