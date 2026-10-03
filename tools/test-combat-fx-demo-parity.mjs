import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {demoFrame} from './fixtures/combat-fx-demo-v13.mjs';
const c=vm.createContext({console,performance:{now:()=>1000}});c.window=c;
const map={},state={mapId:'parity',x:0,y:0};c.GameEngine={getMap:()=>map,getState:()=>state};
for(const file of ['combat-fx-paint','combat-fx-presentation','combat-fx-runtime'])vm.runInContext(fs.readFileSync(new URL('../js/'+file+'.js',import.meta.url),'utf8'),c);
function recorder(){
    const draws=[],stack=[];let path=[],s={globalAlpha:1,transform:[],fillStyle:'#000',strokeStyle:'#000',lineWidth:1};
    const target={draws,save(){stack.push({...s,transform:[...s.transform]});},restore(){s=stack.pop();},beginPath(){path=[];},
        fill(){draws.push({path:[...path],alpha:s.globalAlpha,transform:s.transform,style:s.fillStyle});},
        stroke(){draws.push({path:[...path],alpha:s.globalAlpha,transform:s.transform,style:s.strokeStyle,width:s.lineWidth,cap:s.lineCap,join:s.lineJoin});},
        createLinearGradient(...args){return {args,stops:[],addColorStop(...p){this.stops.push(p);}};},
        createRadialGradient(...args){return {args,stops:[],addColorStop(...p){this.stops.push(p);}};},
        fillText(){},strokeText(){}};
    for(const k of ['translate','scale','rotate','transform'])target[k]=(...v)=>{s.transform=[...s.transform,[k,...v]];};
    for(const k of ['moveTo','lineTo','bezierCurveTo','quadraticCurveTo','arc','ellipse','closePath'])target[k]=(...v)=>path.push([k,...v]);
    return new Proxy(target,{get:(o,k)=>k in o?o[k]:s[k],set:(o,k,v)=>(s[k]=v,true)});
}
const normalize=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='number'?Math.round(v*1e7)/1e7:v));
const project=p=>({x:400+(p.x-p.y)*72,y:300+(p.x+p.y)*36});
const args={cellPx:144,cellCenter:(x,y)=>project({x,y}),projection:{tileWidth:144,isIsometric:true,directionVector:(x,y)=>({x:(x-y)*72,y:(x+y)*36})}};
let checks=0;
for(const move of Object.keys(c.CombatFxPaint.accents))for(const result of ['hit','parry','armor','miss','dry','distance'])for(const side of ['left','right'])for(const to of [{x:1,y:0},{x:0,y:1},{x:-1,y:-1}]){
    c.CombatFxRuntime.clear();
    const from={x:0,y:0,kind:'player',key:'player'},target={...to,kind:'enemy',key:'enemy'};
    c.CombatFxRuntime.enqueue({actionId:'case',mapId:'parity',attacker:from,defender:target,segments:[{moveId:move,limbId:side==='left'?'lhand':'rhand',hitPart:'chest',result,damage:12}]});
    const action=c.CombatFxRuntime.getActiveActions()[0],segment=action.segments[0];
    const e={actor:'player',target:'enemy',from,to,move,part:'chest',side,result,at:segment.startMs*1.5,hitAt:segment.hitMs*1.5,segment:0,segmentCount:1,powerFactor:1};
    for(const age of [-160,-25,0,55,125]){
        const t=e.hitAt+age,expected=recorder(),actual=recorder(),ref=demoFrame(expected,c.CombatFxPaint,[e],t,{project,scale:1});
        ref.draw(e);c.CombatFxRuntime.render({...args,ctx:actual,nowMs:t/1.5});
        assert.deepEqual(normalize(actual.draws),normalize(expected.draws),`${move}/${result}/${side}/${JSON.stringify(to)}/${age}: ink must equal approved demo`);
        for(const [key,p,kind] of [['player',from,'player'],['enemy',to,'enemy']]){
            assert.deepEqual(normalize(c.CombatFxRuntime.getPawnOffsetAt(p.x,p.y,kind,{...args,nowMs:t/1.5})),normalize(ref.offset(key)),key+' whole-pawn motion');
        }
        checks++;
    }
}
console.log(`PASS approved demo parity: ${checks} frames, exact brush commands, opacity, contact details and both pawn offsets.`);
