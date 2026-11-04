import fs from 'node:fs/promises';
const dir=new URL('../assets/dungeon/grid-scene-v1/',import.meta.url),p=new URL('registration.json',dir),rows=JSON.parse(await fs.readFile(p,'utf8'));
const round=new Set(['damaged-barrel-v1','reused-plastic-drum-v1','reused-washer-drum-v1','rice-cooker-cache-v1','pressure-pot-cache-v1','cable-spool-shelf-v1','milk-churn-storage-v1','tire-storage-basket-v1','marine-buoy-cache-v1','barrel-cooking-stove','campfire-small-pot','small-enamel-water-jug','tire-pair','practice-stump']);
for(const r of rows){if(round.has(r.id))r.contactKind='round silhouette';}
const widths={'barrel-cooking-stove':.40,'campfire-small-pot':.52,'old-water-filter':.36,'first-aid-trolley':.44,'fragment-desk':.49,'car-seat-rest-berth':.35,'practice-stump':.28};
for(const r of rows)if(widths[r.id])r.tileWidth=Math.min(r.tileWidth,widths[r.id]);
// Human scale limits use the ground's far corner, not the full PNG height
// (which includes footprint depth). Final judgment remains the in-board review.
const heightLimits={
 'abandoned-chest-v1':42,'discarded-toolbox-v1':22,'damaged-barrel-v1':52,
 'lost-backpack-v1':34,'salvaged-shopping-cart-v1':58,'reused-plastic-drum-v1':50,
 'reused-washer-drum-v1':38,'patched-suitcase-v1':44,'repaired-cooler-v1':34,
 'rice-cooker-cache-v1':22,'pressure-pot-cache-v1':22,'wheelie-bin-cache-v1':62,
 'postbox-cache-v1':74,'factory-locker-cache-v1':90,'vending-machine-cupboard-v1':90,
 'pram-cargo-basket-v1':56,'wire-cage-trolley-v1':85,'stacked-plastic-crates-v1':64,
 'sideways-oil-drum-cabinet-v1':58,'cable-spool-shelf-v1':55,'milk-churn-storage-v1':38,
 'motorcycle-topbox-cache-v1':28,'tire-storage-basket-v1':36,'aluminum-flight-case-v1':30,
 'marine-buoy-cache-v1':42,'patched-bulk-sack-v1':85,'timber-rack':70,
 'old-radiator':46,'tire-pair':42,'barrel-cooking-stove':55,'first-aid-trolley':55,
 'car-seat-rest-berth':60,'campfire-small-pot':28,'small-enamel-water-jug':24,'practice-stump':46
};
const checks=JSON.parse(await fs.readFile(new URL('asset-checks.json',dir),'utf8'));
for(const r of rows){
 if(r.projectionMode==='native')continue; // Individually reviewed; do not reapply the historical affine height cap.
 const limit=heightLimits[r.id];if(!limit)continue;
 const a=r.unsearched||r.normal,[l,n,t]=a.contacts,c=checks[a.file];
 const u=(n[1]-l[1])/(n[0]-l[0]),v=(t[1]-n[1])/(t[0]-n[0]);
 const d=r.contactKind==='round silhouette'?1:Math.SQRT2/(u-v);
 const estimate=(l[1]+t[1]-n[1]-Math.max(0,c.bbox[1]-2))*144*r.tileWidth/(t[0]-l[0])*d;
 if(estimate>limit)r.tileWidth=Math.floor(r.tileWidth*limit/estimate*1000)/1000;
 r.heightReference=`144px grid; closed/normal rear-ground height estimate capped at ${limit}px; compare against existing player and boss in board review`;
}
await fs.writeFile(p,JSON.stringify(rows,null,2)+'\n');
