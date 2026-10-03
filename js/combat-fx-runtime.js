/** Live combat presentation. Consumes resolved action snapshots; never writes world state. */
(function (global) {
    'use strict';
    const paint = global.CombatFxPaint, SPEED = 1.5, MAX_ACTIONS = 64;
    const aliases = { thug_punch:'jab', thug_knee:'kick_knee', thug_shove:'shove', enemy_counter_strike:'jab' };
    const clamp = (n,a=0,b=1)=>Math.max(a,Math.min(b,n));
    let actions = [], busy = new Map(), groups = new Map(), seen = new Set(), mapRef = null, mapId = null;
    const now = ()=>global.performance && global.performance.now ? global.performance.now() : Date.now();
    let playbackClock=null;
    function startPlaybackClock(realTime=now()) { playbackClock={time:realTime,last:realTime}; }
    function advancePlaybackClock(realTime) {
        if(!playbackClock)startPlaybackClock(realTime);
        playbackClock.time+=global.CombatFxPresentation.frameDelta(realTime-playbackClock.last);
        playbackClock.last=Math.max(playbackClock.last,realTime);
        return playbackClock.time;
    }
    const playbackTime=()=>playbackClock?playbackClock.time:now();
    const frameTime=args=>args.combatNowMs??args.nowMs??playbackTime();
    function clear() { actions=[];busy.clear();groups.clear();seen.clear();
        const el=global.document&&global.document.querySelector('.player-pawn-visual');if(el)el.style.translate='';
    }
    function syncMap() {
        const engine=global.GameEngine, st=engine && engine.getState(), map=engine && engine.getMap();
        if (!st || !map) { clear();mapRef=null;mapId=null;return; }
        if (map !== mapRef || st.mapId !== mapId) { clear();mapRef=map;mapId=st.mapId; }
    }
    function moveFor(s) {
        if (paint.accents[s.moveId]) return s.moveId;
        if (aliases[s.moveId]) return aliases[s.moveId];
        if (s.damageType === 'slash' || s.damageType === 'pierce') return 'weapon_strike';
        return /foot|leg/.test(s.limbId || '') ? 'front_kick' : 'jab';
    }
    function schedule(p,start,groupTiming) {
        let cursor=start;
        const segments=p.segments.map((s,i)=>{
            const move=moveFor(s),windup=(groupTiming?groupTiming.windup:paint.accents[move].windup)/SPEED;
            const entry={...s,segmentId:s.segmentId||p.actionId+':'+i,move,index:i,startMs:cursor,hitMs:cursor+windup};
            const base=p.baseSegments||(move==='slap_combo'?2:1);
            cursor+=(groupTiming?groupTiming.gap:Math.max(paint.segmentGap,p.segments.length!==base?paint.accents[move].windup+80:0))/SPEED;
            return entry;
        });
        return {...p,startMs:start,endMs:segments[segments.length-1].hitMs+paint.recovery/SPEED,segments};
    }
    function reserve(action) {
        [action.attacker.key,action.defender.key].forEach(k=>busy.set(k,Math.max(busy.get(k)||0,action.endMs+260/SPEED)));
    }
    function enqueue(payload) {
        syncMap();
        if (!payload || payload.mapId !== mapId || !Array.isArray(payload.segments) || !payload.segments.length || seen.has(payload.actionId)) return;
        // Own all event data. Replay callers and combat contexts can be changed after this point.
        const p=JSON.parse(JSON.stringify(payload));
        if (![p.attacker,p.defender].every(a=>a && Number.isFinite(a.x) && Number.isFinite(a.y))) return;
        const time=playbackTime(), keys=[p.attacker.key,p.defender.key], group=p.simultaneous && p.groupId;
        let start=Math.max(time,...keys.map(k=>busy.get(k)||0));
        let timing=null;
        if(group){
            const lead=Math.max(...p.segments.map(s=>paint.accents[moveFor(s)].windup));
            const base=p.baseSegments||(moveFor(p.segments[0])==='slap_combo'?2:1);
            const gap=Math.max(paint.segmentGap,p.segments.length!==base?lead+80:0);
            timing=groups.get(group)||{start,windup:lead,gap};
            timing.windup=Math.max(timing.windup,lead);timing.gap=Math.max(timing.gap,gap);
            start=timing.start;groups.set(group,timing);
            // Both commits arrive in one synchronous exchange, before the next frame.
            // Align contact as well as start, even for a jab against a slower-looking kick.
            actions=actions.map(a=>{if(a.groupId!==group)return a;const updated=schedule(a,start,timing);reserve(updated);return updated;});
        }
        const action=schedule(p,start,timing);reserve(action);actions.push(action);
        seen.add(p.actionId);
        if (actions.length>MAX_ACTIONS) actions.shift();
        if (seen.size>512) seen.delete(seen.values().next().value);
        if (groups.size>128) groups.delete(groups.keys().next().value);
    }
    function presentationEvents() {
        return actions.flatMap(a=>a.segments.map(s=>({actor:a.attacker.key,target:a.defender.key,from:a.attacker,to:a.defender,
            move:s.move,side:/^(lhand|lfoot|left)/.test(s.limbId||'')?'left':'right',part:s.hitPart,result:s.result,
            segment:s.index,at:s.startMs*SPEED,hitAt:s.hitMs*SPEED,powerFactor:s.powerFactor,segmentId:s.segmentId})));
    }
    function viewFor(args) {
        const projection=args.projection,scale=(projection&&projection.tileWidth||args.cellPx||144)/144;
        const center=args.cellCenter||((x,y)=>{const p=args.cellToPx(x,y);return {x:p.x+args.cellPx/2,y:p.y+args.cellPx/2};});
        return {scale,heightScale:projection&&projection.isIsometric===false?.35:1,project:p=>center(p.x,p.y),
            direction:(dx,dy)=>projection&&projection.directionVector?projection.directionVector(dx,dy):{x:(dx-dy)*72,y:(dx+dy)*36}};
    }
    function getPawnOffsetAt(x,y,kind,args) {
        syncMap();const events=presentationEvents(),keys=new Set(),time=frameTime(args)*SPEED,view=viewFor(args);
        const matches=p=>p.x===x&&p.y===y&&(kind==='player'?p.kind==='player':p.kind==='enemy');
        events.forEach(e=>{if(matches(e.from))keys.add(e.actor);if(matches(e.to))keys.add(e.target);});
        const out={x:0,y:0};
        keys.forEach(key=>{const local=events.filter(e=>(e.actor===key&&matches(e.from))||(e.target===key&&matches(e.to)));
            const p=global.CombatFxPresentation.pawnOffset(key,local,time,view.project,view.scale);out.x+=p.x;out.y+=p.y;});
        return out;
    }
    function drawSegment(ctx,a,s,time,args,events) {
        const age=(time-s.hitMs)*SPEED;if(time<s.startMs||age>660)return;
        const e=events.find(e=>e.segmentId===s.segmentId),view=viewFor(args);
        const shape=global.CombatFxPresentation.drawStrike(ctx,e,time*SPEED,view,events);if(!shape)return;
        const g={target:shape.bp,scale:shape.scale};
        if(age>=0){
            const labels={miss:'闪开',parry:'招架',armor:'吸收',dry:'乏力',distance:'挥空'};
            const label=(a.segments.length>1?(s.index+1)+'/'+a.segments.length+' ':'')+(labels[s.result]||String(Math.round(s.damage)));
            ctx.save();ctx.globalAlpha=clamp(1-(age-260)/400);ctx.fillStyle=s.result==='hit'?'#ffe4ae':'#c1ded5';
            ctx.font='bold '+Math.max(11,Math.round(12*g.scale))+'px "Microsoft YaHei",sans-serif';ctx.textAlign='center';
            ctx.strokeStyle='#17241c';ctx.lineWidth=3;const y=g.target.y-(96+s.index*13+age*.02)*g.scale;
            ctx.strokeText(label,g.target.x,y);ctx.fillText(label,g.target.x,y);ctx.restore();
        }
    }
    function render(args) {
        syncMap();if (!args || !args.ctx || !mapRef)return;
        const time=frameTime(args);
        actions=actions.filter(a=>time<=a.segments[a.segments.length-1].hitMs+660/SPEED);
        busy.forEach((end,key)=>{if(end<time)busy.delete(key);});
        const events=presentationEvents();
        actions.forEach(a=>a.segments.forEach(s=>drawSegment(args.ctx,a,s,time,args,events)));
        const el=global.document&&global.document.querySelector('.player-pawn-visual');
        if(el){const st=global.GameEngine.getState(),offset=getPawnOffsetAt(st.x,st.y,'player',{...args,nowMs:time});el.style.translate=offset.x+'px '+offset.y+'px';}
    }
    global.CombatFxRuntime={enqueue,render,clear,speed:SPEED,
        startPlaybackClock,advancePlaybackClock,getPlaybackTime:playbackTime,
        getPawnOffsetAt, hasPawnMotion:time=>actions.some(a=>time>=a.startMs&&time<=a.segments[a.segments.length-1].hitMs+260/SPEED),
        getActiveActions:()=>JSON.parse(JSON.stringify(actions))};
    if(global.SceneAnimation)global.SceneAnimation.on('combat:resolved',enqueue);
})(typeof window !== 'undefined' ? window : globalThis);
