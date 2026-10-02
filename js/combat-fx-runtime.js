/** Live combat presentation. Consumes resolved action snapshots; never writes world state. */
(function (global) {
    'use strict';
    const paint = global.CombatFxPaint, SPEED = 1.5, MAX_ACTIONS = 64;
    const aliases = { thug_punch:'jab', thug_knee:'kick_knee', thug_shove:'shove', enemy_counter_strike:'jab' };
    const parts = { head:52,chest:28,abdomen:20,lhand:30,rhand:30,lfoot:9,rfoot:9,left_arm:30,right_arm:30,left_leg:9,right_leg:9 };
    const clamp = (n,a=0,b=1)=>Math.max(a,Math.min(b,n));
    let actions = [], busy = new Map(), groups = new Map(), seen = new Set(), mapRef = null, mapId = null;
    const now = ()=>global.performance && global.performance.now ? global.performance.now() : Date.now();
    function clear() { actions=[];busy.clear();groups.clear();seen.clear(); }
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
            const entry={...s,move,index:i,startMs:cursor,hitMs:cursor+windup};
            cursor+=(groupTiming?groupTiming.gap:Math.max(paint.segmentGap,paint.accents[move].windup+80))/SPEED;
            return entry;
        });
        return {...p,startMs:start,endMs:segments[segments.length-1].hitMs+paint.recovery/SPEED,segments};
    }
    function reserve(action) {
        [action.attacker.key,action.defender.key].forEach(k=>busy.set(k,Math.max(busy.get(k)||0,action.endMs+70/SPEED)));
    }
    function enqueue(payload) {
        syncMap();
        if (!payload || payload.mapId !== mapId || !Array.isArray(payload.segments) || !payload.segments.length || seen.has(payload.actionId)) return;
        // Own all event data. Replay callers and combat contexts can be changed after this point.
        const p=JSON.parse(JSON.stringify(payload));
        if (![p.attacker,p.defender].every(a=>a && Number.isFinite(a.x) && Number.isFinite(a.y))) return;
        const time=now(), keys=[p.attacker.key,p.defender.key], group=p.simultaneous && p.groupId;
        let start=Math.max(time,...keys.map(k=>busy.get(k)||0));
        let timing=null;
        if(group){
            const lead=Math.max(...p.segments.map(s=>paint.accents[moveFor(s)].windup));
            timing=groups.get(group)||{start,windup:lead,gap:Math.max(paint.segmentGap,lead+80)};
            timing.windup=Math.max(timing.windup,lead);timing.gap=Math.max(timing.gap,lead+80);
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
    function geometry(a,s,args) {
        const scale=(args.projection && args.projection.tileWidth || args.cellPx || 144)/144;
        const heightScale=args.projection && args.projection.isIsometric===false ? .35 : 1;
        const center=args.cellCenter || ((x,y)=>{const p=args.cellToPx(x,y);return {x:p.x+args.cellPx/2,y:p.y+args.cellPx/2};});
        const ap=center(a.attacker.x,a.attacker.y),bp=center(a.defender.x,a.defender.y);
        const limbSide=/^(lhand|lfoot|left)/.test(s.limbId||'')?-1:1;
        const side=limbSide*(s.move==='slap_combo' && s.index%2?-1:1);
        const leg=['front_kick','whip_kick','kick_knee'].includes(s.move);
        const from={x:ap.x+(s.move==='shove'?0:limbSide*7)*scale,y:ap.y-(leg?3:19)*scale*heightScale};
        const left=/^(lhand|lfoot|left)/.test(s.hitPart),right=/^(rhand|rfoot|right)/.test(s.hitPart);
        const dest={x:bp.x+(left?-10:right?10:0)*scale,y:bp.y-(parts[s.hitPart]||28)*scale*heightScale};
        const roundhouse=s.move==='whip_kick';
        // Use the game's projection (45-degree ground), not the prototype's 2:1 grid.
        const iso=!args.projection || args.projection.isIsometric!==false;
        const lateral=args.projection && args.projection.directionVector
            ? args.projection.directionVector(-(a.defender.y-a.attacker.y),a.defender.x-a.attacker.x)
            : {x:-(bp.y-ap.y)*(iso?2:1),y:(bp.x-ap.x)*(iso?.5:1)};
        const norm=Math.hypot(lateral.x,lateral.y)||1;lateral.x/=norm;lateral.y/=norm;
        if(roundhouse){dest.x+=lateral.x*limbSide*7*scale;dest.y+=lateral.y*limbSide*7*scale;if(['abdomen','chest'].includes(s.hitPart))dest.y-=8*scale*heightScale;}
        if(s.move==='kick_knee' && /foot|leg/.test(s.hitPart))dest.y=bp.y-17*scale*heightScale;
        if(s.result==='parry'){dest.x+=(from.x-dest.x)*.12;dest.y+=4*scale;}
        if(s.result==='miss')dest.y-=15*scale;
        if(s.result==='distance'){dest.x=from.x+(dest.x-from.x)*.45;dest.y=from.y+(dest.y-from.y)*.45;}
        const angle=Math.atan2(dest.y-from.y,dest.x-from.x),length=Math.hypot(dest.x-from.x,dest.y-from.y)/scale;
        const lift=roundhouse?10*clamp(lateral.y*side*2):0;
        const sweep=roundhouse?[(lateral.x*Math.cos(angle)+lateral.y*Math.sin(angle))*side*36-Math.sin(angle)*lift,(-lateral.x*Math.sin(angle)+lateral.y*Math.cos(angle))*side*36-Math.cos(angle)*lift]:null;
        const contactAngle=roundhouse?angle+Math.atan2(-Math.PI*sweep[1],length-Math.PI*sweep[0]):angle;
        return {from,dest,target:bp,angle,length,sweep,contactAngle,side,scale};
    }
    function drawSegment(ctx,a,s,time,args) {
        const elapsed=(time-s.startMs)*SPEED,age=(time-s.hitMs)*SPEED;
        if(elapsed<0 || age>660)return;
        const g=geometry(a,s,args),wind=(time-s.startMs)/(s.hitMs-s.startMs);
        if(age<=paint.trailLife){
            ctx.save();ctx.translate(g.from.x,g.from.y);ctx.scale(g.scale,g.scale);ctx.rotate(g.angle);
            ctx.globalAlpha=clamp(wind*2)*(s.result==='dry'?.3:.9);
            paint.drawMoveTrail(ctx,{move:s.move,length:g.length,progress:paint.motionProgress(wind),side:g.side,age,wind,angle:g.angle,sweep:g.sweep,result:s.result});ctx.restore();
        }
        if(age>=0 && age<=paint.contactLife && ['hit','parry','armor'].includes(s.result)){
            const q=age/paint.contactLife;
            ctx.save();ctx.translate(g.dest.x,g.dest.y);ctx.scale(g.scale,g.scale);ctx.rotate(g.contactAngle);ctx.globalAlpha=Math.pow(1-q,1.5);
            if(s.result==='hit'){const strength=.65+.35*Math.sqrt(clamp(s.powerFactor==null?1:s.powerFactor,0,2));ctx.scale(strength,strength);paint.drawMoveContact(ctx,s.move,q,g.side,g.contactAngle);}
            else paint.drawDefense(ctx,s.result,q);
            ctx.restore();
        }
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
        const time=args.nowMs!=null?args.nowMs:now();
        actions=actions.filter(a=>time<=a.segments[a.segments.length-1].hitMs+660/SPEED);
        busy.forEach((end,key)=>{if(end<time)busy.delete(key);});
        actions.forEach(a=>a.segments.forEach(s=>drawSegment(args.ctx,a,s,time,args)));
    }
    global.CombatFxRuntime={enqueue,render,clear,speed:SPEED,
        getActiveActions:()=>JSON.parse(JSON.stringify(actions))};
    if(global.SceneAnimation)global.SceneAnimation.on('combat:resolved',enqueue);
})(typeof window !== 'undefined' ? window : globalThis);
