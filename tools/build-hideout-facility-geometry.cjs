// Geometry reference only: never edits generated artwork.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'reference/hideout-facilities-v2');
const plans={
 stove:{w:.80,d:.72,h:39,top:77},pharmacy:{w:.90,d:.70,h:39,top:65},
 forging:{w:.95,d:.90,h:38,top:66},sewing:{w:.90,d:.70,h:38,top:62},
 toolbench:{w:.90,d:.70,h:39,top:75},warehouse:{w:.90,d:.80,h:66,top:78},
 bathroom:{w:.95,d:.95,h:40,top:94},barrel:{w:.75,d:.70,h:45,top:49},
 farm:{w:.95,d:.95,h:15,top:35},ranch:{w:.95,d:.95,h:28,top:32},
 bed:{w:.80,d:1.70,h:24,top:44,logical:[1,2],offset:[0,-.5]}
};
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'geometry.json'),JSON.stringify({tileWidth:144,tileHeight:144/Math.SQRT2,plans},null,2)+'\n');
(async()=>{const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1254,height:1254}});
for(const [key,c]of Object.entries(plans)){
 const K=c.top>80?5.5:c.d>1.5?5:7,p=(x,y,h=0)=>[627+(x-y)*72*K,870+(x+y)*72/Math.SQRT2*K-h*K];
 const foot=[[-c.w/2,-c.d/2],[c.w/2,-c.d/2],[c.w/2,c.d/2],[-c.w/2,c.d/2]],q=z=>foot.map(([x,y])=>p(x,y,z));
 const poly=(pts,fill,stroke='#354a41')=>`<polygon points="${pts.map(a=>a.join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="5"/>`;
 const f=q(0),t=q(c.h),hi=q(c.top);
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254"><rect width="1254" height="1254" fill="#ebe7d9"/>${poly(f,'#d1dbcd','#c18a37')}${poly([t[1],t[2],f[2],f[1]],'#84998c')}${poly([t[2],t[3],f[3],f[2]],'#a2b1a0')}${poly(t,'#c3d0b9')}${hi.map((a,i)=>`<line x1="${a[0]}" y1="${a[1]}" x2="${t[i][0]}" y2="${t[i][1]}" stroke="#a46f40" stroke-width="3" stroke-dasharray="10 10"/>`).join('')}${poly(hi,'none','#a46f40')}${f.map(a=>`<circle cx="${a[0]}" cy="${a[1]}" r="6" fill="#ce8d32"/>`).join('')}<text x="45" y="55" font-family="sans-serif" font-size="28">${key} / footprint ${c.w} x ${c.d} / work surface ${c.h}px</text><text x="45" y="95" font-family="sans-serif" font-size="22">144px tile / ground slopes +/- 0.7071 / vertical edges upright</text></svg>`;
 fs.writeFileSync(path.join(dir,key+'-geometry.svg'),svg);await page.setContent(svg);await page.screenshot({path:path.join(dir,key+'-geometry.png')});
} }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
