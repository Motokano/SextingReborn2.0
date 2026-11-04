const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.ART_PLAYWRIGHT || 'playwright');

const dir = path.resolve('reference/farm-ranch-5x5-v1');
fs.mkdirSync(dir, { recursive: true });
const k = 1.36, origin = [620, 330];
const p = (x, y, z = 0) => [origin[0] + (x-y)*72*k, origin[1] + (x+y)*72/Math.SQRT2*k-z*k];
const points = a => a.map(v => p(...v).join(',')).join(' ');
const line = (a,b,color='#778273',width=2) => `<polyline points="${points([a,b])}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
const rect = (x,y,w,d,z=0,fill='#c8d1b8') => `<polygon points="${points([[x,y,z],[x+w,y,z],[x+w,y+d,z],[x,y+d,z]])}" fill="${fill}" stroke="#435847" stroke-width="2"/>`;
const box = (x,y,w,d,h,fill) => rect(x,y,w,d,h,fill)+`<polygon points="${points([[x+w,y,h],[x+w,y+d,h],[x+w,y+d,0],[x+w,y,0]])}" fill="#8c9d90" stroke="#435847" stroke-width="2"/><polygon points="${points([[x,y+d,h],[x+w,y+d,h],[x+w,y+d,0],[x,y+d,0]])}" fill="#b3baa6" stroke="#435847" stroke-width="2"/>`;
function svg(kind){
 let s='<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1120"><rect width="1240" height="1120" fill="#ece9dc"/>';
 s+='<g font-family="sans-serif" fill="#233e30"><text x="35" y="45" font-size="25">'+kind+' / 5 x 5 cells / geometry guide ONLY</text><text x="35" y="80" font-size="18">144 x 101.823px cells; orthographic axes +/- 0.7071; no floor or grid in final art</text></g>';
 s+=rect(0,0,5,5,0,'#e2d9bc');
 for(let i=0;i<=5;i++) s+=line([i,0],[i,5])+line([0,i],[5,i]);
 if(kind==='ranch'){
  const edges=[[[0,0],[5,0]],[[5,0],[5,5]],[[5,5],[0,5]],[[0,5],[0,0]]];
  for(const [a,b] of edges){s+=line([...a,32],[...b,32],'#946336',8)+line([...a,15],[...b,15],'#946336',5);}
  for(let i=0;i<=5;i++)for(const a of [[i,0],[i,5],[0,i],[5,i]])s+=line(a,[...a,38],'#66452b',7);
  for(const end of [[2.5,0],[5,2.5],[2.5,5],[0,2.5]])s+=line([2.5,2.5,27],[...end,27],'#536875',15);
  s+=box(2.25,2.25,.5,.5,42,'#b2b5a2');
  s+=box(.2,.2,1.1,.35,18,'#b4a27e')+box(3.6,2.7,.9,.55,28,'#b4a27e');
 } else {
  s+=box(.05,.05,1.1,1.1,20,'#75a4b0');
  s+=rect(1.2,.1,.18,4.75,3,'#7caabb')+rect(1.2,2.45,3.6,.18,3,'#7caabb')+rect(3,0.2,.18,4.6,3,'#7caabb');
  for(const [x,y,w,d] of [[1.55,.2,1.2,1.9],[3.4,.2,1.4,1.9],[1.55,2.95,1.2,1.8],[3.4,2.95,1.4,1.8]])s+=box(x,y,w,d,12,'#aa9069');
  s+=line([3.5,.4],[3.5,.4,60],'#886a3e',5)+line([4.6,.4],[4.6,.4,60],'#886a3e',5)+line([3.5,.4,60],[4.6,.4,60],'#886a3e',5);
 }
 s+='<text x="35" y="1080" font-family="sans-serif" font-size="20" fill="#233e30">Ground corners and grid are guides, NOT a display pedestal.</text></svg>';
 return s;
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1240,height:1120}});
  for(const kind of ['ranch','farm']){
   const content=svg(kind);fs.writeFileSync(path.join(dir,kind+'-geometry.svg'),content);
   await page.setContent(content);await page.screenshot({path:path.join(dir,kind+'-geometry.png')});
  }
  fs.writeFileSync(path.join(dir,'geometry.json'),JSON.stringify({tileWidth:144,tileHeight:144/Math.SQRT2,footprint:[5,5],scale:k,origin,groundCorners:[[0,0],[5,0],[5,5],[0,5]].map(v=>p(...v)),note:'Drawing target only; generated art needs separate ground-contact registration.'},null,2)+'\n');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
