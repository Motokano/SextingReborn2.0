// Pre-generation geometry references only; generated artwork is never modified.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const dir=path.resolve('reference/gym-facilities-v1');
const plans={
 floor:{w:.95,d:1.8,h:3,top:22,logical:[1,2]},
 pullup:{w:1.3,d:.9,h:60,top:120,logical:[2,1]},
 dumbbell:{w:1,d:.7,h:28,top:43,logical:[1,1]},
 barbell:{w:1.35,d:1.85,h:25,top:96,logical:[2,2]},
 cable:{w:1,d:1.4,h:27,top:120,logical:[1,2]},
 leg:{w:.95,d:1.5,h:28,top:78,logical:[1,2]},
 neck:{w:1.35,d:.9,h:28,top:85,logical:[2,1]},
 handsfeet:{w:.9,d:.7,h:38,top:38,logical:[2,2]},
 hands:{w:.5,d:.35,h:3,top:14,logical:[0,0]},
 ankle:{w:.65,d:.6,h:4,top:15,logical:[0,0]},
 toes:{w:.6,d:.45,h:3,top:9,logical:[0,0]}
};
fs.mkdirSync(dir,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1254,height:1254}});
for(const [key,c]of Object.entries(plans)){
 const K=Math.min(1080/(72*(c.w+c.d)),1040/(c.top+(c.w+c.d)*72/Math.SQRT2));
 const cy=1140-(c.w+c.d)*36/Math.SQRT2*K;
 const p=(x,y,h=0)=>[627+(x-y)*72*K,cy+(x+y)*72/Math.SQRT2*K-h*K];
 const f=[[-c.w/2,-c.d/2],[c.w/2,-c.d/2],[c.w/2,c.d/2],[-c.w/2,c.d/2]];
 const q=z=>f.map(([x,y])=>p(x,y,z)),base=q(0),work=q(c.h),top=q(c.top);
 c.template={scale:K,groundCenter:[627,cy],groundContacts:base,workSurface:work,topCorners:top};
 const polygon=(pts,fill,stroke='#354a41')=>`<polygon points="${pts.map(a=>a.join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="4"/>`;
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254"><rect width="1254" height="1254" fill="#ebe7d9"/>${polygon(base,'#d1dbcd','#c18a37')}${polygon([work[1],work[2],base[2],base[1]],'#84998c')}${polygon([work[2],work[3],base[3],base[2]],'#a2b1a0')}${polygon(work,'#c3d0b9')}${top.map((a,i)=>`<line x1="${a[0]}" y1="${a[1]}" x2="${work[i][0]}" y2="${work[i][1]}" stroke="#a46f40" stroke-width="3" stroke-dasharray="10 10"/>`).join('')}${polygon(top,'none','#a46f40')}${base.map(a=>`<circle cx="${a[0]}" cy="${a[1]}" r="6" fill="#ce8d32"/>`).join('')}<text x="35" y="42" font-family="sans-serif" font-size="24">${key} / ${c.w} x ${c.d} cells / surface ${c.h}px / top ${c.top}px</text><text x="35" y="75" font-family="sans-serif" font-size="20">144px tile / ground slopes +/- 0.7071 / vertical edges upright</text></svg>`;
 fs.writeFileSync(path.join(dir,key+'-geometry.svg'),svg);await page.setContent(svg);await page.screenshot({path:path.join(dir,key+'-geometry.png')});
}
fs.writeFileSync(path.join(dir,'geometry.json'),JSON.stringify({tileWidth:144,tileHeight:144/Math.SQRT2,plans},null,2)+'\n');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
