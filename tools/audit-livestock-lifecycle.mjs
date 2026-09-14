import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fixture,species,items} from './lib/livestock-test-fixture.mjs';
const report={version:6,scope:'Real lifecycle ticks; replenished external feed counted; manual pollution care counted; no health resets or disabled lifespan.',growth:[],years:[],ledgerChecks:0,maxLedgerError:0};
function setup(coop=true){const f=fixture();f.mount('axis','slot1','slaughter');if(coop)f.mount('arm3','inner','coop');for(const arm of ['arm1','arm2','arm3','arm4'])for(const slot of ['cw_side','ccw_side'])f.mount(arm,slot,'feed_trough',5);return f;}
function step(f){const st=f.ls.getState();const ts=Object.values(st.arms).flatMap(a=>Object.values(a)).filter(m=>m&&!m.shadow&&m.module_id==='feed_trough');ts.forEach(t=>t.feed_units=450);f.tick();let feed=ts.reduce((n,t)=>n+450-t.feed_units,0);for(const a of st.animals){if(a.dead)continue;const n=a.nutrition_state.last;if(!n)continue;const err=Math.abs(n.intake+n.reserve_used-n.maintenance_paid-n.reserve_refilled-n.recovery_spent-n.growth_spent-n.production_spent-n.gestation_spent-n.unused);assert(err<1e-8);report.ledgerChecks++;report.maxLedgerError=Math.max(err,report.maxLedgerError);}return feed;}
function meat(f,a){const r=f.ls.previewSlaughter(a.uid);assert(r.ok);return r.items.filter(x=>species[a.species_id].products.slaughter.meat_item_ids.includes(x.item_id)).reduce((n,x)=>n+x.count*items[x.item_id].weight_kg,0);}
if(process.argv.includes('--years-only')){const old=JSON.parse(fs.readFileSync(new URL('../docs/reference/livestock-lifecycle-verification.json',import.meta.url),'utf8'));report.growth=old.growth;report.ledgerChecks=old.growth.reduce((n,r)=>n+r.ticks,0);}
for(const [kind,sp]of (process.argv.includes('--years-only')?[]:Object.entries(species))){
 const f=setup(),a=f.animal(kind,kind==='chicken'?'arm3':'z1',{age_ticks:0,weight_kg:sp.growth.birth_weight_kg,satiety:100});let ticks=0,feed=0,cleans=0;
 while(a.weight_kg<sp.growth.fatten_cap_kg-1e-7&&ticks<sp.growth.target_fatten_ticks*1.3){
  for(const [zid,z]of Object.entries(f.st.zones))if(z.pollution>20){assert(f.ls.cleanZone(zid,10).ok);cleans++;}
  feed+=step(f);ticks++;assert(!a.dead);
  if(ticks===Math.floor(sp.growth.target_fatten_ticks/2))f.ls.setState(JSON.parse(JSON.stringify(f.st)));
  // Rebind after reload while preserving fixture references used by this isolated run.
  if(f.ls.getState()!==f.st){Object.assign(a,f.ls.getState().animals[0]);f.st=f.ls.getState();f.st.animals[0]=a;}
 }
 assert(Math.abs(ticks-sp.growth.target_fatten_ticks)<10,kind+' growth timing '+ticks);
 const r={kind,ticks,days:ticks/144,feedUnits:feed,maizeKg:feed*items.herb_maize.weight_kg,meatKg:meat(f,a),manualCleans:cleans};report.growth.push(r);console.log('growth',JSON.stringify(r));
}
for(const seedStart of [7,19,41]){
 const f=setup();let seed=seedStart;f.ctx.Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 f.animal('cattle','z1',{gender:'female',weight_kg:600,satiety:100});f.animal('sheep','z4',{weight_kg:80,satiety:100});
 const pig=f.animal('pig','z3',{weight_kg:.9,age_ticks:0,satiety:100});
 for(let i=0;i<5;i++)f.animal('chicken','arm3',{age_ticks:i<2?300*144:(i-2)*30*144,weight_kg:i<2?2.5:.05+2.45*[0,.3,.7][i-2],satiety:100});
 const r={seed:seedStart,ticks:365*144,feedUnits:0,chickReplacements:0,chickenMeatKg:0,slaughters:[],products:{},deaths:0,pigMeatKg:0};
 for(let t=0;t<r.ticks;t++){
  const st=f.ls.getState();r.feedUnits+=step(f);
  for(const a of st.animals.slice()){
   if(a.dead){r.deaths++;throw Error('unexpected death '+a.species_id);}
   if(a.species_id==='chicken'&&!['animal_4','animal_5'].includes(a.uid)&&a.age_ticks>=90*144&&a.weight_kg>=2.5){
    // Founder layers have stable ids; replacement birds never become layers in this scenario.
    r.slaughters.push({age:a.age_ticks,hp:a.hp,weight:a.weight_kg,meat:meat(f,a),perks:a.perks});r.chickenMeatKg+=meat(f,a);assert(f.ls.slaughterAnimal(a.uid).ok);assert(f.ls.admitAnimal('chicken','arm3').ok);r.chickReplacements++;continue;
   }
   for(const p of species[a.species_id].products.living.filter(p=>p.nutrition_per_item>0)){const out=f.ls.collectProduct(a.uid,p.product_id);if(out.ok)r.products[out.item_id]=(r.products[out.item_id]||0)+out.count;}
  }
  if(t===26000)f.ls.setState(JSON.parse(JSON.stringify(st)));
 }
 const p=f.ls.getState().animals.find(a=>a.uid===pig.uid);r.pigMeatKg=meat(f,p);assert(r.pigMeatKg>=58);assert(r.chickReplacements>=6);report.years.push(r);console.log('year',JSON.stringify(r));
}
fs.writeFileSync(new URL('../docs/reference/livestock-lifecycle-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log('PASS lifecycle audit',report.ledgerChecks,'ledgers');
