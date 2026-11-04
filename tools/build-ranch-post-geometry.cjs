const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.ART_PLAYWRIGHT || 'playwright-core');
const dir = path.resolve('reference/ranch-circular-post-v3');
fs.mkdirSync(dir, {recursive:true});
const k = 1.6, radius = 2.35;
const p = (x,y,z=0) => [600+(x-y)*72*k,530+(x+y)*72/Math.SQRT2*k-z*k];
const line = (a,b,color,w) => `<path d="M${p(...a).join(',')} L${p(...b).join(',')}" stroke="${color}" stroke-width="${w}" fill="none"/>`;
const ellipse = (r,z,color,w) => `<ellipse cx="600" cy="${530-z*k}" rx="${r*72*Math.SQRT2*k}" ry="${r*72*k}" stroke="${color}" stroke-width="${w}" fill="none"/>`;
let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1080"><rect width="1200" height="1080" fill="#efece0"/><text x="30" y="45" font-family="sans-serif" font-size="26">Round paddock with one ordinary central post</text>';
for(let v=-2.5;v<=2.5;v++) svg += line([v,-2.5],[v,2.5],'#a8b4ad',2)+line([-2.5,v],[2.5,v],'#a8b4ad',2);
svg += ellipse(radius,15,'#946336',6)+ellipse(radius,36,'#946336',9);
for(let n=0;n<16;n++){const a=n*Math.PI/8,x=Math.cos(a)*radius,y=Math.sin(a)*radius;svg+=line([x,y],[x,y,42],'#795a36',7);}
for(const [x,y] of [[radius,0],[0,radius],[-radius,0],[0,-radius]]) svg += line([0,0,30],[x,y,30],'#566d78',12)+line([0,0,12],[x,y,12],'#566d78',7);
svg += line([0,0],[0,0,50],'#795a36',26);
svg += '<text x="30" y="1020" font-family="sans-serif" font-size="20">5 x 5 reserved cells. Four stationary fence partitions; four quarter-circle paddocks.</text><text x="30" y="1052" font-family="sans-serif" font-size="20">Geometry guide only. Final sprite has transparent empty ground and no labels.</text></svg>';
fs.writeFileSync(path.join(dir,'geometry.svg'),svg);
fs.writeFileSync(path.join(dir,'geometry.json'),JSON.stringify({logicalFootprint:[5,5],radiusCells:radius,tileWidth:144,tileHeight:144/Math.SQRT2,ellipseRadiiAt144:[radius*72*Math.SQRT2,radius*72],center:'ordinary stationary post',partitions:4},null,2)+'\n');
(async()=>{const b=await chromium.launch({headless:true});try{const page=await b.newPage({viewport:{width:1200,height:1080}});await page.setContent(svg);await page.screenshot({path:path.join(dir,'geometry.png')});}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
