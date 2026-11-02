/* SPDX-License-Identifier: GPL-3.0-only */
(()=>{'use strict';
const entries=globalThis.HarvestPawnCatalog,images=new Map(),byId=new Map();let invalidate=()=>{};
for(const a of entries){const family=byId.get(a.id)||{};family[a.state]=a;byId.set(a.id,family);}
function state(p){return p.used||p.remaining===0?'empty':!Number.isFinite(p.remaining)||p.remaining===p.total?'full':p.remaining/p.total<=.5?'low':'touched';}
function art(p){return byId.get(p.id)?.[state(p)];}
function draw(ctx,p,x,y,s){const a=art(p);if(!a)return false;let im=images.get(a.file);if(!im){im=new Image();im.onload=()=>invalidate();im.src=a.file;images.set(a.file,im);}if(!im.complete||!im.naturalWidth)return true;
 const b=a.bounds,full=byId.get(p.id).full.bounds,f=Math.min(s*.96/full[2],s*1.1/full[3]);
 ctx.drawImage(im,b[0],b[1],b[2],b[3],x+(b[0]-b[4])*f,y+s*.16+(b[1]-b[5])*f,b[2]*f,b[3]*f);return true;
}
globalThis.RuinsHarvestPawns={catalog:entries,state,art,draw,setInvalidation:fn=>invalidate=fn};
})();
