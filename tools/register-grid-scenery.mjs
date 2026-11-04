import fs from 'node:fs/promises';
const dir=new URL('../assets/dungeon/grid-scene-v1/',import.meta.url), rows=JSON.parse(await fs.readFile(new URL('registration.json',dir),'utf8')), plan=JSON.parse(await fs.readFile(new URL('scenery-plan.json',dir),'utf8'));
const contacts={
'timber-rack':[[242,927],[544,1116],[1091,810]],
'broken-chair':[[326,975],[670,1171],[939,990]],
'old-radiator':[[396,871],[651,1008],[1100,748]],
'tire-pair':[[286,878],[633,1032],[974,875]],
'sealed-cargo-obstacle-v1':[[220,767],[746,1083],[1185,800]],
'collapsed-rubble-obstacle-v1':[[323,685],[750,914],[1190,700]],
'timber-stone-barricade-v1':[[250,532],[1153,936],[1323,826]],
'workshop-machine-v1':[[264,690],[1005,1008],[1325,838]],
'workshop-bench-v1':[[272,650],[960,997],[1181,860]],
'canteen-table-v1':[[262,527],[1016,953],[1271,803]],
'canteen-counter-v1':[[296,612],[1024,950],[1244,814]],
'clinic-bed-v1':[[220,532],[1034,961],[1326,778]],
'clinic-bench-v1':[[185,504],[1070,972],[1314,831]],
'old-water-filter':[[377,976],[642,1166],[901,1052]],
'barrel-cooking-stove':[[382,981],[653,1083],[871,991]],
'first-aid-trolley':[[272,946],[677,1171],[994,978]],
'car-seat-rest-berth':[[330,968],[683,1122],[948,962]],
'campfire-small-pot':[[290,847],[670,1000],[1012,821]],
'small-enamel-water-jug':[[392,893],[669,1001],[931,898]],
'fragment-desk':[[264,848],[734,1102],[1002,919]],
'practice-stump':[[486,942],[711,1054],[936,942]],
'exit-waypost':[[399,978],[696,1130],[750,1101]],
'canteen-food-crate':[[203,794],[687,1096],[1143,799]]
};
// Broad ground contacts, not PNG crop edges. Widths reviewed alongside the 144px player.
const widths={'broken-chair':.34,'old-radiator':.48,'old-water-filter':.45,'first-aid-trolley':.53,'car-seat-rest-berth':.42,'fragment-desk':.67,'practice-stump':.32,'exit-waypost':.19,'small-enamel-water-jug':.23};
for(const p of plan){
 // Versioned redraws own their contacts, source and footprint.
 if(rows.find(a=>a.id===p.id)?.sourceRoot)continue;
 const category=p.id==='canteen-food-crate'?'container':p.id==='exit-waypost'?'decor':['fragment-desk','practice-stump'].includes(p.id)?'insight':plan.indexOf(p)>=13?'recovery':'decor';
 const entry={id:p.id,name:p.name,category,tileWidth:widths[p.id]??p.width,logicalFootprint:p.footprint,normal:{file:p.id,contacts:contacts[p.id]}};
 const old=rows.findIndex(a=>a.id===p.id);if(old<0)rows.push(entry);else rows[old]={...rows[old],...entry};
}
for(const [id,name,file,width,c] of [['broken-fan','停转旧风扇','stopped-fan',.22,[[436,955],[650,1060],[865,950]]],['worn-mat','磨旧地垫','worn-mat',.9,[[63,493],[818,1029],[1182,791]]]]){
 await fs.copyFile(new URL('../street-thug-boss-room-v6/'+file+'.png',dir),new URL(id+'.png',dir));
 const e={id,name,category:'decor',tileWidth:width,logicalFootprint:[1,1],normal:{file:id,contacts:c},reuse:'approved room v6'};
 const i=rows.findIndex(a=>a.id===id);if(i<0)rows.push(e);else rows[i]=e;
}
await fs.writeFile(new URL('registration.json',dir),JSON.stringify(rows,null,2)+'\n');
