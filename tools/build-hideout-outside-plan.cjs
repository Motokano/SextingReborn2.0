const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.ART_PLAYWRIGHT||'playwright');
const m=JSON.parse(fs.readFileSync('data/maps/M0_Base_Outside_lv_1.json','utf8'));
const out=path.resolve('reference/farm-ranch-5x5-v1');fs.mkdirSync(out,{recursive:true});
const placement=process.argv.includes('--placement')?JSON.parse(fs.readFileSync(path.join(out,'placement.json'),'utf8')):null;
const name=placement?'hideout-outside-placement':'hideout-outside-plan';
const step=48,left=78,top=110,w=920,h=1000;
const blocked=new Set(m.blocks.map(p=>p.x+','+p.y));
const entities=new Map(m.entities.map(p=>[p.x+','+p.y,p.entity_id]));
const text=(x,y,s,size=14,color='#e7dfc5',anchor='middle')=>`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="${anchor}">${s}</text>`;
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="font-family:Microsoft YaHei,sans-serif"><rect width="100%" height="100%" fill="#21342a"/>`;
svg+=text(78,42,'藏身处外部 · 平面地图',25,'#ead7aa','start')+text(78,72,'16 × 16格　·　横轴 x ／ 纵轴 y　·　坐标从0开始',14,'#bdc7b0','start');
for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++){
 const key=x+','+y,note=(m.annotations||{})[key],entity=entities.get(key),b=blocked.has(key),X=left+x*step,Y=top+y*step;
 const fill=b?'#6b6960':note==='可开垦田地'?'#756547':'#3d5340';
 svg+=`<rect x="${X}" y="${Y}" width="${step}" height="${step}" fill="${fill}" stroke="#9dac8960"/>`;
 if(note==='树'){svg+=`<circle cx="${X+24}" cy="${Y+23}" r="17" fill="#213e2b" stroke="#9ba779"/>`+text(X+24,Y+28,'树',14);}
 else if(entity==='gathering_grass')svg+=text(X+24,Y+29,'草',12,'#aabd87');
 else if(entity==='gathering_bush')svg+=text(X+24,Y+29,'灌',13,'#c3bd77');
 else if(entity==='fishing_pond'){svg+=`<rect x="${X+3}" y="${Y+3}" width="42" height="42" rx="10" fill="#416c78"/>`+text(X+24,Y+28,'池塘',12);}
}
for(const p of m.portals){const X=left+p.x*step,Y=top+p.y*step;svg+=`<rect x="${X+2}" y="${Y+2}" width="44" height="44" rx="4" fill="#b39a56"/>`+text(X+24,Y+28,p.label==='进家'?'进家':'野外',13,'#18271d');}
for(let i=0;i<16;i++){svg+=text(left+(i+.5)*step,top-14,String(i),14,'#d9cfb4');svg+=text(left-22,top+(i+.5)*step+5,String(i),14,'#d9cfb4');}
svg+=text(left+5.5*step,top+3.1*step,'藏身处建筑',19,'#efe4cb');
svg+=text(left+12*step,top+7*step-10,'原可开垦区',13,'#e4c18c');
if(placement)for(const f of placement.facilities){
 const X=left+f.x*step,Y=top+f.y*step;
 svg+=`<rect x="${X+2}" y="${Y+2}" width="${f.width*step-4}" height="${f.height*step-4}" fill="${f.color}" fill-opacity=".13" stroke="${f.color}" stroke-width="4"/>`;
 svg+=`<rect x="${X+8}" y="${Y+8}" width="${f.width*step-16}" height="58" rx="4" fill="#253a2a" fill-opacity=".94"/>`;
 svg+=text(X+f.width*step/2,Y+32,f.label+' · 5 × 5',19,f.color);
 svg+=text(X+f.width*step/2,Y+54,`(${f.x},${f.y}) → (${f.x+f.width-1},${f.y+f.height-1})`,14,f.color);
}
svg+=text(78,915,'灰色：不可通行　　棕色：原可开垦区　　草／灌：采集点',14,'#c1cbb5','start');
svg+=text(78,945,placement?'农场：(0,8) ～ (4,12)　　牧场：(11,7) ～ (15,11)':'农场、牧场各需5 × 5格；可指定各自左上角坐标或圈出区域。',15,'#ead7aa','start');
svg+=text(78,974,placement?(placement.status==='deployed'?'正式部署 · 两处各占5×5格 · 范围内草和灌木已清理':placement.vegetationClearance?'选址预览 · 范围内草和灌木已清理 · 设施尚未接入':'选址预览 · 保留原图物件标记 · 尚未改动正式地图'):'正式地图数据预览 · 尚未放置新设施',12,'#99ad94','start')+'</svg>';
fs.writeFileSync(path.join(out,name+'.svg'),svg);
(async()=>{const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:w,height:h}});await page.setContent(svg);await page.screenshot({path:path.join(out,name+'.png')});}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
