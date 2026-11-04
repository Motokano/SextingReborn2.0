const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const plans={locker:{w:.85,d:.65,h:95,top:106},bench:{w:1.65,d:.55,h:28,top:40},crate:{w:.75,d:.65,h:25,top:38},fittings_x:{w:3,d:.1,h:90,top:90},fittings_y:{w:.1,d:3,h:90,top:90}};
const dir=path.resolve('reference/gym-room-v1');fs.mkdirSync(dir,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1254,height:1254}});
for(const [id,c]of Object.entries(plans)){
 const k=Math.min(1050/(72*(c.w+c.d)),1000/(c.top+(c.w+c.d)*72/Math.SQRT2)),cy=1150-(c.w+c.d)*36/Math.SQRT2*k;
 const p=(x,y,z=0)=>[627+(x-y)*72*k,cy+(x+y)*72/Math.SQRT2*k-z*k];
 const f=[[-c.w/2,-c.d/2],[c.w/2,-c.d/2],[c.w/2,c.d/2],[-c.w/2,c.d/2]],b=f.map(v=>p(...v)),t=f.map(v=>p(...v,c.h));
 const poly=(v,col)=>'<polygon points="'+v.map(q=>q.join(',')).join(' ')+'" fill="'+col+'" stroke="#3b4b40" stroke-width="4"/>';
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254"><rect width="1254" height="1254" fill="#e6e4d6"/>'+poly(b,'#ddc68b')+poly([b[1],b[2],t[2],t[1]],'#849283')+poly([b[2],b[3],t[3],t[2]],'#acbaa4')+poly(t,'#c9d0b9')+'<text x="30" y="40" font-size="24" font-family="sans-serif">'+id+' / '+c.w+' x '+c.d+' cells / height '+c.h+'px</text></svg>';
 fs.writeFileSync(path.join(dir,id+'-geometry.svg'),svg);await page.setContent(svg);await page.screenshot({path:path.join(dir,id+'-geometry.png')});c.template={scale:k,groundCenter:[627,cy],groundContacts:b};
}fs.writeFileSync(path.join(dir,'geometry.json'),JSON.stringify({tileWidth:144,tileHeight:144/Math.SQRT2,plans},null,2)+'\n');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
