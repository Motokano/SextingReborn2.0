const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.ART_PLAYWRIGHT||'playwright-core');
const root=path.resolve('.'),dir=path.join(root,'reference/ranch-circular-post-v3');
const manifest=JSON.parse(fs.readFileSync('assets/map/isometric/ranch-circular-post-v3/manifest.json'));
const generation=JSON.parse(fs.readFileSync('assets/map/isometric/ranch-circular-post-v3/generation.json'));
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1040,height:1020},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://ranch-post-preview.test/**',async route=>{
  const relative=decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//,'');
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep))return route.abort();
  if(relative==='assets/map/isometric/farm-ranch-5x5-v1/manifest.json')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(manifest)});
  const mime={'.html':'text/html','.mjs':'text/javascript','.json':'application/json','.png':'image/png'};
  await route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 await page.goto('http://ranch-post-preview.test/tools/farm-ranch-5x5-review.html?no_reload');
 await page.waitForFunction(()=>window.reviewReady);
 const a=manifest.assets[0];
 const alpha=await page.evaluate(async asset=>{
  const i=new Image();i.src=asset.file;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const t=c.getContext('2d');t.drawImage(i,0,0);const d=t.getImageData(0,0,c.width,c.height).data;
  let zero=0,borderMax=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const v=d[(y*c.width+x)*4+3];if(!v)zero++;if(x===0||y===0||x===c.width-1||y===c.height-1)borderMax=Math.max(borderMax,v);}
  return{size:[i.width,i.height],transparentPixels:zero,borderMax,samples:asset.alphaSamples.map(([x,y])=>({x,y,alpha:d[(y*c.width+x)*4+3]}))};
 },a);
 if(sha(a.file)!==a.sha256||sha(generation.source)!==a.sha256)throw new Error('Original image hash mismatch');
 // The raw output has isolated alpha=1 edge noise; use the same visible-alpha cutoff as inspectPng.
 if(alpha.borderMax>=16||alpha.samples.some(p=>p.alpha!==0))throw new Error('Alpha check failed: '+JSON.stringify(alpha));
 await page.locator('#ranch').screenshot({path:path.join(dir,'board.png')});
 await page.locator('#wall').click();await page.locator('#ranch').screenshot({path:path.join(dir,'wall.png')});
 await page.locator('#contacts').click();await page.locator('#ranch').screenshot({path:path.join(dir,'contacts.png')});
 if(errors.length)throw new Error(errors.join('\n'));
 const result={status:'passed',scope:'Candidate art on 144px grid with 125% player; isolated preview only.',originalPreserved:true,sha256:a.sha256,scaleAt144:a.scaleAt144,logicalFootprint:a.logicalFootprint,pageErrors:errors,alpha};
 fs.writeFileSync(path.join(dir,'checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
