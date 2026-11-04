const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.ART_PLAYWRIGHT||'playwright-core');
const dir=path.resolve('reference/ranch-circular-v2');fs.mkdirSync(dir,{recursive:true});
const k=1.6,origin=[600,530],radius=2.35;
const p=(x,y,z=0)=>[origin[0]+(x-y)*72*k,origin[1]+(x+y)*72/Math.SQRT2*k-z*k];
const line=(a,b,color='#98a59d',w=2)=>`<path d="M${p(...a).join(',')} L${p(...b).join(',')}" stroke="${color}" stroke-width="${w}" fill="none"/>`;
const ellipse=(r,z,color,w)=>`<ellipse cx="600" cy="${530-z*k}" rx="${r*72*Math.SQRT2*k}" ry="${r*72*k}" stroke="${color}" stroke-width="${w}" fill="none"/>`;
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1080"><rect width="1200" height="1080" fill="#efece0"/><g font-family="sans-serif" fill="#233e30"><text x="30" y="45" font-size="26">Circular ranch — geometry guide ONLY</text><text x="30" y="78" font-size="17">5 x 5 reserved cells. Circle lies inside the diamond. 4 equal radial arms; 4 open sectors.</text></g>';
for(let v=-2.5;v<=2.5;v++)svg+=line([v,-2.5],[v,2.5])+line([-2.5,v],[2.5,v]);
svg+=ellipse(radius,0,'#c7a476',2)+ellipse(radius,15,'#946336',6)+ellipse(radius,36,'#946336',9);
for(let n=0;n<16;n++){const a=n*Math.PI/8,x=Math.cos(a)*radius,y=Math.sin(a)*radius;svg+=line([x,y],[x,y,42],'#795a36',7);}
for(const [x,y]of [[2.15,0],[0,2.15],[-2.15,0],[0,-2.15]])svg+=line([0,0,30],[x,y,30],'#566d78',17)+line([x,y],[x,y,32],'#566d78',7);
svg+=ellipse(.32,22,'#7f8a74',22)+ellipse(.25,44,'#7f8a74',24);
svg+='<g font-family="sans-serif" font-size="18" fill="#233e30"><text x="30" y="1018">Fences: 42px high; central hub: 44px high at 144px tile width. Modules sit inside swept radius.</text><text x="30" y="1048">No grid, guide strokes, ground slab, text or cast shadow in the final transparent sprite.</text></g></svg>';
fs.writeFileSync(path.join(dir,'geometry.svg'),svg);
fs.writeFileSync(path.join(dir,'geometry.json'),JSON.stringify({logicalFootprint:[5,5],radiusCells:radius,tileWidth:144,tileHeight:144/Math.SQRT2,ellipseRadiiAt144:[radius*72*Math.SQRT2,radius*72],note:'Circle inscribed in square ground footprint; source art retains native projection.'},null,2)+'\n');
(async()=>{const b=await chromium.launch({headless:true});try{const page=await b.newPage({viewport:{width:1200,height:1080}});await page.setContent(svg);await page.screenshot({path:path.join(dir,'geometry.png')});}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
