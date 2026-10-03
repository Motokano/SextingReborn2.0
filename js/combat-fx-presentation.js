/** Approved demo choreography, shared by preview and live combat.
 * Display-only screen offsets. Never changes pawn assets, skeletons or world positions.
 * Times are unscaled animation milliseconds; callers apply their playback speed once.
 */
(function(global){
'use strict';
const paint=global.CombatFxPaint;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const ease=t=>1-Math.pow(1-clamp(t),3);
// The demo advances at most 60 real milliseconds per displayed frame.
// Keep long combat commits or background tabs from consuming the entire stroke.
const frameDelta=elapsed=>Math.min(Math.max(elapsed,0),60);
const heights={head:52,chest:28,abdomen:20,lhand:30,rhand:30,lfoot:9,rfoot:9,left_arm:30,right_arm:30,left_leg:9,right_leg:9};
function pawnOffset(key,events,time,project,scale=1){
    let x=0,y=0;
    for(const e of events){
        const a=project(e.from),b=project(e.to),angle=Math.atan2(b.y-a.y,b.x-a.x),age=time-e.hitAt;
        if(e.actor===key&&time>=e.at&&age<paint.recovery){
            const n=(time-e.at)/(e.hitAt-e.at),power=['front_kick','whip_kick','kick_knee'].includes(e.move)?9:12;
            const v=age>=0?power*(1-ease(age/paint.recovery)):n<.2?-1.2*Math.sin(n/.2*Math.PI):power*paint.motionProgress(n);
            x+=Math.cos(angle)*v;y+=Math.sin(angle)*v;
        }
        if(e.target===key&&age>=0&&age<260){
            const pulse=(1-Math.exp(-age/15))*Math.exp(-age/80)*clamp(1-age/260);
            if(e.result==='hit'||e.result==='parry'){const v=pulse*(e.result==='parry'?3:9);x+=Math.cos(angle)*v;y+=Math.sin(angle)*v;}
            if(e.result==='miss'){x+=Math.sin(angle)*pulse*8;y-=Math.cos(angle)*pulse*6;}
        }
    }
    return {x:x*scale,y:y*scale};
}
function geometry(e,time,view,offset){
    const scale=view.scale||1,heightScale=view.heightScale??1,ap=view.project(e.from),bp=view.project(e.to);
    const limbSide=e.side==='left'?-1:1,side=limbSide*(e.move==='slap_combo'&&e.segment%2?-1:1);
    const rootHeight=['front_kick','whip_kick','kick_knee'].includes(e.move)?3:19;
    const from={x:ap.x+(e.move==='shove'?0:limbSide*7)*scale+offset.x,y:ap.y-rootHeight*scale*heightScale+offset.y};
    const left=/^(lhand|lfoot|left)/.test(e.part),right=/^(rhand|rfoot|right)/.test(e.part);
    const dest={x:bp.x+(left?-10:right?10:0)*scale,y:bp.y-(heights[e.part]??28)*scale*heightScale};
    const roundhouse=e.move==='whip_kick',d={x:e.to.x-e.from.x,y:e.to.y-e.from.y};
    const lateral=view.direction(-d.y,d.x),norm=Math.hypot(lateral.x,lateral.y)||1;
    lateral.x/=norm;lateral.y/=norm;
    if(roundhouse){dest.x+=lateral.x*limbSide*7*scale;dest.y+=lateral.y*limbSide*7*scale;if(['abdomen','chest'].includes(e.part))dest.y-=8*scale*heightScale;}
    if(e.move==='kick_knee'&&/foot|leg/.test(e.part))dest.y=bp.y-17*scale*heightScale;
    if(e.result==='parry'){dest.x+=(from.x-dest.x)*.12;dest.y+=4*scale;}
    if(e.result==='miss')dest.y-=15*scale;
    if(e.result==='distance'){dest.x=from.x+(dest.x-from.x)*.45;dest.y=from.y+(dest.y-from.y)*.45;}
    const angle=Math.atan2(dest.y-from.y,dest.x-from.x),length=Math.hypot(dest.x-from.x,dest.y-from.y)/scale;
    const lift=roundhouse?10*clamp(lateral.y*side*2):0;
    const sweep=roundhouse?[(lateral.x*Math.cos(angle)+lateral.y*Math.sin(angle))*side*36-Math.sin(angle)*lift,(-lateral.x*Math.sin(angle)+lateral.y*Math.cos(angle))*side*36-Math.cos(angle)*lift]:null;
    const contactAngle=roundhouse?angle+Math.atan2(-Math.PI*sweep[1],length-Math.PI*sweep[0]):angle;
    return {from,dest,ap,bp,scale,side,angle,length,sweep,contactAngle};
}
function line(ctx,points,color,width){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke();}
function drawStrike(ctx,e,time,view,events){
    const life=time-e.at;if(life<0||life>950)return;
    const offset=pawnOffset(e.actor,events,time,view.project,view.scale);
    const g=geometry(e,time,view,offset),age=time-e.hitAt,wind=(time-e.at)/(e.hitAt-e.at);
    if(age<=paint.trailLife){
        ctx.save();ctx.translate(g.from.x,g.from.y);ctx.scale(g.scale,g.scale);ctx.rotate(g.angle);
        ctx.globalAlpha=clamp(wind*2)*(e.result==='dry'?.3:.9);
        paint.drawMoveTrail(ctx,{move:e.move,length:g.length,progress:paint.motionProgress(wind),side:g.side,age,wind,angle:g.angle,sweep:g.sweep,result:e.result});ctx.restore();
    }
    if(age>=0&&age<=paint.contactLife&&['hit','parry','armor'].includes(e.result)){
        const q=age/paint.contactLife;
        ctx.save();ctx.translate(g.dest.x,g.dest.y);ctx.scale(g.scale,g.scale);ctx.rotate(g.contactAngle);ctx.globalAlpha=Math.pow(1-q,1.5);
        if(e.result==='hit'){
            const strength=.65+.35*Math.sqrt(clamp(e.powerFactor??1,0,2));ctx.scale(strength,strength);paint.drawMoveContact(ctx,e.move,q,g.side,g.contactAngle);
        }else if(e.result==='parry'){
            paint.drawDefense(ctx,'parry',q);ctx.strokeStyle='#b2c5b6';ctx.lineWidth=3*(1-q)+.7;ctx.beginPath();ctx.arc(0,0,12+q*6,Math.PI*.6,Math.PI*1.4);ctx.stroke();
            for(let i=0;i<5;i++){const a=Math.PI*.65+i*.18;line(ctx,[[Math.cos(a)*(8+q*16),Math.sin(a)*(8+q*16)],[Math.cos(a)*(12+q*27),Math.sin(a)*(12+q*27)]],'#e0e6cd',1);}
        }else{
            ctx.rotate(-g.contactAngle);paint.drawDefense(ctx,'armor',q);ctx.strokeStyle='#a0c5b9';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-12,-10);ctx.lineTo(0,-15);ctx.lineTo(12,-10);ctx.lineTo(9,8);ctx.lineTo(0,15);ctx.lineTo(-9,8);ctx.closePath();ctx.stroke();
        }
        ctx.restore();
    }
    return g;
}
global.CombatFxPresentation={pawnOffset,geometry,drawStrike,frameDelta};
})(typeof window!=='undefined'?window:globalThis);
