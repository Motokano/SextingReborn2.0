const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.ART_PLAYWRIGHT||'playwright');
const root=path.resolve('.'),dir=path.resolve(process.env.FARM_RANCH_ART_REVIEW_DIR||'reference/farm-ranch-5x5-v1');
fs.mkdirSync(dir,{recursive:true});
const base='assets/map/isometric/farm-ranch-5x5-v1/';
const manifest=JSON.parse(fs.readFileSync(base+'manifest.json'));
const sources={ranch:'exec-e71cb0aa-0797-4819-8d7e-95f2bc8ec26d.png',farm:'exec-2230f97f-6877-4784-87e2-41fb7828fd95.png'};
const sourceDir='C:/Users/haoxian.huang/.codex/generated_images/01a1a411-36e0-7ab3-9ad9-d71cfc1dfb7d/';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1040,height:1020},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Serve the isolated preview from files through request interception; no network required.
 await page.route('http://farm-ranch-preview.test/**',async route=>{
  const relative=decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//,'');
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep))return route.abort();
  const mime={'.html':'text/html','.mjs':'text/javascript','.json':'application/json','.png':'image/png'};
  await route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 await page.goto('http://farm-ranch-preview.test/tools/farm-ranch-5x5-review.html?no_reload');await page.waitForFunction(()=>window.reviewReady);
 const results=[];
 for(const a of manifest.assets){
  const rgba=await page.evaluate(async asset=>{const i=new Image();i.src=asset.file;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;let zero=0,solid=0,partial=0,minX=c.width,minY=c.height,maxX=0,maxY=0,edge=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){let alpha=d[(y*c.width+x)*4+3];if(!alpha)zero++;else{alpha===255?solid++:partial++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(x===0||y===0||x===c.width-1||y===c.height-1)edge++;}}return{width:c.width,height:c.height,transparentPixels:zero,opaquePixels:solid,partialAlphaPixels:partial,visibleBounds:[minX,minY,maxX+1-minX,maxY+1-minY],occupiedImageBorderPixels:edge,samples:asset.alphaSamples.map(([x,y])=>({x,y,alpha:d[(y*c.width+x)*4+3]}))};},a);
  rgba.borderAlpha=await page.evaluate(async asset=>{const i=new Image();i.src=asset.file;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const t=c.getContext('2d');t.drawImage(i,0,0);const d=t.getImageData(0,0,c.width,c.height).data;let max=0,atLeast32=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(x===0||y===0||x===c.width-1||y===c.height-1){const a=d[(y*c.width+x)*4+3];max=Math.max(max,a);if(a>=32)atLeast32++;}return{max,atLeast32};},a);
  const raw=fs.readFileSync(a.file),hash=sha(raw),original=sha(fs.readFileSync(sourceDir+sources[a.id]));
  if(hash!==original||!rgba.transparentPixels)throw new Error(a.id+' source/alpha check failed: '+JSON.stringify(rgba));
  if(hash!==a.sha256||JSON.stringify(a.imageSize)!==JSON.stringify([rgba.width,rgba.height]))throw new Error(a.id+' registration mismatch');
  const slope=(u,v)=>(v[1]-u[1])/(v[0]-u[0]);
  results.push({id:a.id,originalPreserved:hash===original,sha256:hash,...rgba,scaleAt144:a.scaleAt144,logicalFootprint:a.logicalFootprint,shape:a.shape||'rectangular',observedSupportEdgeSlopes:a.shape==='circular'?null:[slope(a.groundContacts[0],a.groundContacts[1]),slope(a.groundContacts[0],a.groundContacts[3])],note:'Native projection retained; no shear or nonuniform rescale. Contacts are approximate visual estimates; curved contacts are not grid-axis edges.'});
  await page.locator('#'+a.id).screenshot({path:path.join(dir,a.id+'-board.png')});
 }
 await page.locator('#wall').click();for(const id of ['ranch','farm'])await page.locator('#'+id).screenshot({path:path.join(dir,id+'-wall.png')});
 await page.locator('#contacts').click();await page.locator('#grid').click();
 if(errors.length)throw new Error(errors.join('\n'));
 fs.writeFileSync(path.join(dir,'checks.json'),JSON.stringify({date:'2026-11-04',scope:'art preview only; no game state or runtime map changes',pageErrors:errors,assets:results},null,2)+'\n');
 console.log(JSON.stringify(results.map(({id,width,height,transparentPixels,occupiedImageBorderPixels,borderAlpha})=>({id,width,height,transparentPixels,occupiedImageBorderPixels,borderAlpha})),null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
