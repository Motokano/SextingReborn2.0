import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const config=JSON.parse(fs.readFileSync('data/hunting.json','utf8'));
const context=vm.createContext({});vm.runInContext(fs.readFileSync('js/hunting.js','utf8'),context);
const H=context.Hunting;
function setup(event,variant='foraging',seed=1){
 let time=0,stamina=100,items=0,allowed=true;const rewards=[];
 H.configure(config,{now:()=>time,canStart:()=>true,canContinue:()=>allowed,canSpend:()=>true,stamina:()=>stamina,count:()=>10,
 consume:()=>{items++;return true;},spend:n=>stamina-=n,tick:()=>time++,grant:r=>rewards.push(r),makeJuvenile:species=>({species}),changed:()=>{}});
 H.setState({version:1,points:{p:{seed,event,readyAt:0}},active:null,successes:0});H.start('p',[event]);
 const s=H.getState();s.active.variant=variant;H.setState(s);
 return {rewards,get time(){return time;},get stamina(){return stamina;},get items(){return items;},set allowed(v){allowed=v;}};
}
function seed(value){const s=H.getState();s.points.p.seed=value;assert(H.setState(s));}
function doAction(id){assert.equal(H.reason(id),null,id);assert(H.act(id).ok);}
// Verify every species/variant, both outputs, and actual displayed costs/chances.
for(const event of Object.keys(config.events))for(const variant of Object.keys(config.variants)){
 for(const target of event==='rabbit'?['meat']:['meat','juvenile']){
  const e=setup(event,variant);if(event!=='rabbit')doAction(target);
  const obs=H.getAction('observe');assert.equal(obs.ticks,variant==='watering'?1:2);assert.equal(H.chance('observe'),variant==='watering'?.6:.5);
  if(variant==='passage')assert.equal(H.reason('bait'),'approach');
  seed(1);doAction('observe');doAction('bait');
  const expected=.45+.1+.2+(variant==='foraging'?.1:0)-(variant==='passage'?.05:0)-(event==='cattle_calf'?.1:0);
  assert(Math.abs(H.chance('net')-expected)<1e-9);
  const sta=e.stamina;seed(1);doAction('net');assert.equal(sta-e.stamina,variant==='watering'?10:8);
  assert.equal(e.rewards.length,1);assert.equal(e.rewards[0].count,target==='juvenile'?1:config.events[event].reward_count);
  const saved=H.getState();assert(H.setState(saved));assert.equal(H.getState().active.variant,variant);assert.equal(e.rewards.length,1);
 }
}
// Cattle: one paid reserve tether, one adult recovery, calves protected on failure.
{
 const e=setup('cattle_calf','passage');doAction('meat');assert.equal(H.reason('set_tether'),'passage');
 seed(1);doAction('observe');doAction('bait');doAction('set_tether');assert.equal(H.reason('set_tether'),'done');
 seed(1800);doAction('net');assert.equal(H.getState().active.phase,'straining');assert.equal(H.reason('rest'),'straining');
 const saved=H.getState();assert(H.setState(saved));const spent=e.items,sta=e.stamina;seed(1);doAction('brace');
 assert.equal(e.items,spent);assert.equal(sta-e.stamina,14);assert.equal(e.rewards[0].count,8);assert.equal(H.getState().active.phase,'processing');
}
{
 const e=setup('cattle_calf');doAction('meat');seed(1);doAction('observe');doAction('set_tether');seed(1800);doAction('net');seed(1800);doAction('brace');
 assert.equal(H.getState().active.phase,'ended');assert.equal(e.rewards.length,0);assert.equal(H.getState().points.p.readyAt,e.time+config.cooldown_ticks);
 const calf=setup('cattle_calf');doAction('juvenile');assert.equal(H.reason('net'),'cow');assert.equal(H.reason('set_tether'),'calf_tether');
 doAction('bait');seed(1800);doAction('net');assert.equal(H.getState().active.last,'hunting.result.calf_protected');assert.equal(calf.rewards.length,0);
}
// No rerolls on load; invalid variants rejected; old saves stay on the old baseline.
{
 setup('rabbit');let s=H.getState();s.active.variant='unknown';assert(!H.setState(s));delete s.active.variant;assert(H.setState(s));assert.equal(H.getVariant().title,undefined);
 for(const variant of Object.keys(config.variants)){
  setup('rabbit',variant);for(let i=0;i<(variant==='passage'?3:4);i++)doAction('rest');assert.equal(H.getState().active.phase,'ended');
 }
 const seen=new Set();for(let i=1;i<=30;i++){setup('rabbit','foraging',(Math.imul(i,2654435761)>>>0));H.act('abandon');H.act('close');const s=H.getState();s.points.p.readyAt=0;s.points.p.event='rabbit';H.setState(s);H.start('p',['rabbit']);seen.add(H.getState().active.variant);}assert.equal(seen.size,3);
}
console.log('PASS: all 15 encounters, adult/juvenile rewards, cattle recovery, variant costs/deadlines and save compatibility.');

// Fixed-seed policy comparison. No survival recovery, skill bonuses or processing costs.
if(process.argv.includes('--balance')){
 const lines=['# 狩猎遭遇批量校验','', '每行 1000 场固定种子模拟。直捕为直接使用捕网；准备路线最多观察两次，再投饵、布置可用备用套索／封堵、使用捕网，并尝试可用的补救。幼崽必须先投饵。耗材计份数，不折算不同材料价值；体力不含生存恢复和捕获后处理。数值仅比较这些策略，不代表玩家长期经济收益。','', '| 动物 | 遭遇 | 目标 | 直捕成功率 | 准备成功率 | 准备平均体力 | 准备平均耗材 |','|---|---|---|---:|---:|---:|---:|'];
 const names={rabbit:'兔',pig_calf:'猪',chicken_calf:'鸡',sheep_calf:'羊',cattle_calf:'牛'};
 const labels={foraging:'觅食',watering:'饮水',passage:'窄道'};
 for(const event of Object.keys(config.events))for(const variant of Object.keys(config.variants))for(const target of event==='rabbit'?['meat']:['meat','juvenile']){
  const results=[];
  for(const prepared of [false,true]){
   let wins=0,cost=0,items=0;
   for(let i=1;i<=1000;i++){
    const e=setup(event,variant,Math.imul(i,2654435761)>>>0);if(event!=='rabbit')H.act(target);
    if(prepared || (target==='juvenile'&&variant==='passage'))for(let attempt=0;attempt<2&&!H.reason('observe');attempt++)H.act('observe');
    if(prepared || target==='juvenile')if(!H.reason('bait'))H.act('bait');
    if(prepared)for(const id of ['block','set_intercept','set_tether'])if(!H.reason(id))H.act(id);
    if(!H.reason('net'))H.act('net');
    if(prepared)for(let step=0;step<3;step++){
     const phase=H.getState().active.phase;
     const choices={charge:['hide','counter','retreat'],airborne:['wait_land','air_javelin'],retry:['retry_net'],herd_alert:['intercept'],straining:['brace']}[phase];
     const id=choices?.find(id=>!H.reason(id));if(!id)break;H.act(id);
    }
    if(e.rewards.length)wins++;cost+=100-e.stamina;items+=e.items;
   }
   results.push({rate:(wins/10).toFixed(1),cost:(cost/1000).toFixed(1),items:(items/1000).toFixed(2)});
  }
  lines.push(`| ${names[event]} | ${labels[variant]} | ${target==='meat'?'肉料':'幼崽'} | ${results[0].rate}% | ${results[1].rate}% | ${results[1].cost} | ${results[1].items} |`);
 }
 fs.writeFileSync('docs/design/hunting-encounter-balance.md',lines.join('\n')+'\n');
 console.log(lines.join('\n'));
}
