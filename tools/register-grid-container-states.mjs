import fs from 'node:fs/promises';
const root=new URL('../assets/dungeon/grid-scene-v1/',import.meta.url),rows=JSON.parse(await fs.readFile(new URL('registration.json',root),'utf8'));
const measured={
 'discarded-toolbox':[[250,605],[929,968],[1286,806]],
 'discarded-toolbox-searched':[[350,633],[890,934],[1187,789]],
 'reused-fridge-searched':[[462,879],[786,1066],[1067,895]],
 'salvaged-shopping-cart-searched':[[421,912],[615,1091],[1012,956]],
 'reused-plastic-drum-searched':[[345,948],[656,1106],[975,948]],
 'repaired-cooler-searched':[[353,798],[815,1021],[1090,840]],
 'rice-cooker-cache-searched':[[390,938],[653,1043],[859,971]],
 'pressure-pot-cache-searched':[[383,971],[664,1086],[946,971]],
 'computer-tower-cabinet-searched':[[110,650],[624,1025],[915,880]],
 'wire-cage-trolley-searched':[[223,878],[642,1116],[1050,908]],
 'stacked-plastic-crates-searched':[[257,870],[661,1114],[1049,898]],
 'sideways-oil-drum-cabinet-searched':[[411,696],[831,873],[1143,720]],
 'cable-spool-shelf-searched':[[261,863],[663,1012],[1060,863]],
 'milk-churn-storage-searched':[[357,941],[613,1060],[875,942]],
 'motorcycle-topbox-cache-searched':[[292,776],[736,1041],[1114,820]],
 'tire-storage-basket-searched':[[227,896],[679,1056],[1122,896]],
 'aluminum-flight-case-searched':[[247,731],[811,1023],[1165,799]],
 'marine-buoy-cache-searched':[[365,910],[688,1012],[1019,916]],
 'patched-bulk-sack-searched':[[235,880],[679,1098],[1089,916]]
};
for(const p of rows.filter(p=>p.unsearched)){
 if(p.sourceRoot)continue; // Later art versions own their measured state registration.
 const file=p.unsearched.file+'-searched';try{await fs.access(new URL(file+'.png',root));}catch{continue;}
 if(measured[p.unsearched.file])p.unsearched.contacts=measured[p.unsearched.file];
 if(p.searched?.file===file&&!measured[file])continue;
 p.searched={file,contacts:measured[file]||p.unsearched.contacts};
}
await fs.writeFile(new URL('registration.json',root),JSON.stringify(rows,null,2)+'\n');
