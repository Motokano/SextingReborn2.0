/* Candidate feedback selector. Input facts must already be perceptible to the player.
   No ecology RNG, world clock, hidden-state access, or automatic game integration. */
(function(g){
    'use strict';
    function validate(c){
        if(!c||c.schema_version!==1||!c.groups||!c.selection)throw new Error('feedback: invalid header');
        if(!Number.isInteger(c.selection.recent_per_group)||c.selection.recent_per_group<0||!Number.isInteger(c.selection.remembered_events)||c.selection.remembered_events<1)throw new Error('feedback: invalid selection limits');
        if(!c.dispatch||!Number.isInteger(c.dispatch.max_sentences)||c.dispatch.max_sentences<1)throw Error('feedback: invalid dispatch');
        var ids=new Set();
        Object.keys(c.groups).forEach(function(key){var group=c.groups[key];
            if(['visual','touch','inspection','sound'].indexOf(group.channel)<0||!Array.isArray(group.requires)||!group.requires.length||!group.requires.every(function(f){return typeof f==='string'&&f.length;})||!Array.isArray(group.variants)||group.variants.length<=c.selection.recent_per_group)throw new Error('feedback.groups.'+key+': invalid conditions or variant count');
            if(!Number.isInteger(group.priority)||!Array.isArray(group.suppresses)||!group.suppresses.every(function(id){return id!==key&&!!c.groups[id];}))throw Error('feedback: invalid suppression');
            group.variants.forEach(function(v){if(!v.id||ids.has(v.id)||typeof v.text!=='string'||!v.text.trim())throw new Error('feedback.groups.'+key+': invalid variant');ids.add(v.id);});
        });return true;
    }
    function create(c,saved){
        validate(c);c=JSON.parse(JSON.stringify(c));
        var state=saved?JSON.parse(JSON.stringify(saved)):{version:1,recent:{},events:[]};
        if(state.version!==1||!state.recent||!Array.isArray(state.events)||state.events.length>c.selection.remembered_events)throw new Error('feedback: invalid saved state');
        Object.keys(state.recent).forEach(function(k){if(!Array.isArray(state.recent[k])||state.recent[k].length>c.selection.recent_per_group||!state.recent[k].every(function(id){return typeof id==='string';}))throw new Error('feedback: invalid recent variants');});
        var keys=new Set();state.events.forEach(function(e){if(!e||typeof e.key!=='string'||keys.has(e.key)||typeof e.text!=='string'||typeof e.variant!=='string')throw new Error('feedback: invalid event');keys.add(e.key);});
        function select(input){
            if(!input||typeof input.eventId!=='string'||!input.eventId||!c.groups[input.group])throw new Error('feedback: unknown event/group');
            var group=c.groups[input.group],facts=new Set(input.facts||[]);
            if(!(input.channels||[]).includes(group.channel)||!group.requires.every(function(f){return facts.has(f);}))return null;
            var key=JSON.stringify([input.eventId,input.group]),old=state.events.find(function(e){return e.key===key;});
            if(old)return {text:old.text,variant:old.variant,reused:true};
            var recent=state.recent[input.group]||[],eligible=group.variants.filter(function(v){return recent.indexOf(v.id)<0;});
            // Stable presentation-only choice: never advance the gameplay random sequence.
            var hash=2166136261;for(var i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619)>>>0;
            var v=eligible[hash%eligible.length],terms=input.terms||{};
            var text=v.text.replace(/\{([a-z_]+)\}/g,function(_,term){if(typeof terms[term]!=='string'||!terms[term])throw new Error('feedback: missing perceived term '+term);return terms[term];});
            state.recent[input.group]=recent.concat(v.id).slice(-c.selection.recent_per_group);
            if(c.selection.recent_per_group===0)state.recent[input.group]=[];
            state.events.push({key:key,text:text,variant:v.id});state.events=state.events.slice(-c.selection.remembered_events);
            return {text:text,variant:v.id,reused:false};
        }
        function compose(events,terms){
            var candidates=[];
            events.forEach(function(e){Object.keys(c.groups).forEach(function(id){var spec=c.groups[id];if(e.channels.includes(spec.channel)&&spec.requires.every(function(f){return e.facts.includes(f);}))candidates.push({id:id,event:e});});});
            candidates.sort(function(a,b){return c.groups[b.id].priority-c.groups[a.id].priority||c.groups[b.id].requires.length-c.groups[a.id].requires.length;});
            var blocked=new Set(),chosen=[];
            candidates.forEach(function(x){if(blocked.has(x.id)||chosen.length>=c.dispatch.max_sentences)return;chosen.push(x);blocked.add(x.id);c.groups[x.id].suppresses.forEach(function(id){blocked.add(id);});});
            return chosen.map(function(x){return select({eventId:x.event.id,group:x.id,facts:x.event.facts,channels:x.event.channels,terms:terms}).text;}).join('');
        }
        return {select:select,compose:compose,getState:function(){return JSON.parse(JSON.stringify(state));}};
    }
    g.FishingFeedback={validate:validate,create:create};
})(typeof window!=='undefined'?window:globalThis);
