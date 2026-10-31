import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root=new URL('../assets/map/isometric/manufacturing-bench-v1/',import.meta.url);
const prompts=JSON.parse(fs.readFileSync(new URL('PROMPTS.json',root)));
const specs=[
  {id:'unrepaired',file:'unrepaired-v2.png',sourceId:'unrepaired-v2',level:null,name:'未修复制作台',contacts:[[212,822],[735,1185],[1063,984]],heightSample:[[739,855],[735,1185]]},
  {level:1,name:'基础制作台',contacts:[[238,823],[744,1148],[1038,952]],heightSample:[[748,828],[744,1148]]},
  {level:2,name:'加固制作台',contacts:[[238,828],[746,1173],[1048,977]],heightSample:[[754,836],[746,1173]]},
  {level:3,name:'精密制作台',contacts:[[210,815],[762,1180],[1089,970]],heightSample:[[767,823],[762,1180]]}
];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function inspect(file){
  const b=fs.readFileSync(file),parts=[];assert.equal(b.subarray(1,4).toString(),'PNG');
  let width,height,depth,color,interlace;
  for(let off=8;off<b.length;){const len=b.readUInt32BE(off),type=b.toString('ascii',off+4,off+8),data=b.subarray(off+8,off+8+len);if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];color=data[9];interlace=data[12];}if(type==='IDAT')parts.push(data);off+=len+12;}
  assert.equal(depth,8);assert.equal(color,6,'Expected true RGBA');assert.equal(interlace,0);
  const raw=zlib.inflateSync(Buffer.concat(parts)),stride=width*4,pixels=Buffer.alloc(stride*height);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0,off=0;y<height;y++){const filter=raw[off++];assert(filter<=4);for(let x=0;x<stride;x++){const left=x>=4?pixels[y*stride+x-4]:0,up=y?pixels[(y-1)*stride+x]:0,ul=y&&x>=4?pixels[(y-1)*stride+x-4]:0;const pred=[0,left,up,Math.floor((left+up)/2),paeth(left,up,ul)][filter];pixels[y*stride+x]=(raw[off++]+pred)&255;}}
  let minX=width,minY=height,maxX=0,maxY=0,transparent=0,opaque=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const a=pixels[y*stride+x*4+3];if(!a)transparent++;if(a===255)opaque++;if(a>8){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
  const corners=[[0,0],[width-1,0],[0,height-1],[width-1,height-1]].map(([x,y])=>pixels[y*stride+x*4+3]);assert(corners.every(a=>a===0));assert(transparent>width*height*.2);assert(minX>0&&minY>0&&maxX<width-1&&maxY<height-1);
  return {width,height,crop:[minX,minY,maxX-minX+1,maxY-minY+1],transparentPixels:transparent,opaquePixels:opaque,cornerAlpha:corners,sha256:sha(b)};
}
const assets=specs.map(s=>{
  const id=s.id??`level-${s.level}`,file=s.file??`${id}.png`,checks=inspect(new URL(file,root)),source=prompts.find(p=>p.id===(s.sourceId??id)).generated_source;
  assert.equal(checks.sha256,sha(fs.readFileSync(source)),'Generated PNG must remain unchanged');
  const [l,n,r]=s.contacts,anchor=[(l[0]+r[0])/2,(l[1]+r[1])/2],scale=104.4/(r[0]-l[0]);
  const residuals=[((n[1]-l[1])-(n[0]-l[0])/Math.SQRT2)*scale,((r[1]-n[1])+(r[0]-n[0])/Math.SQRT2)*scale];
  return {...s,id,file,logicalFootprint:[1,1],nativeFacing:'long axis +x; operator side +y',projectionMode:'native',anchor,scaleAt144:scale,worktopHeightPx:(s.heightSample[1][1]-s.heightSample[0][1])*scale,groundAxisResidualPx:residuals,...checks};
});
const manifest={version:1,status:'candidate_art_not_deployed',tileWidth:144,tileHeight:144/Math.SQRT2,pawnScale:1.25,groundFootprintTarget:[.9,.55],geometrySource:'reference/manufacturing-bench-v1/geometry.json',registrationNote:'Contact points are manual estimates of visible feet; anchor is the midpoint of opposite left/right contacts. Back contact is inferred, not independently verified. Render uses uniform scale and translation only, with shared ground width104.4px. Generated camera residuals are recorded, not corrected by image distortion.',assets};
fs.writeFileSync(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(new URL('asset-checks.json',root),JSON.stringify({date:'2026-10-31',sourcePixelsPreserved:true,trueAlpha:true,visualApproval:'pending',assets:assets.map(({id,level,width,height,crop,cornerAlpha,sha256,worktopHeightPx,groundAxisResidualPx})=>({id,level,width,height,crop,cornerAlpha,sha256,worktopHeightPx,groundAxisResidualPx}))},null,2)+'\n');
console.log(JSON.stringify(assets.map(a=>({id:a.id,level:a.level,size:[a.width,a.height],crop:a.crop,worktopHeightPx:+a.worktopHeightPx.toFixed(1),groundAxisResidualPx:a.groundAxisResidualPx.map(x=>+x.toFixed(1))})),null,2));
