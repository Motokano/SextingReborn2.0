/* Evidence is bounded, persisted inside Hunting, and never inferred from skill level. */
(function(global){
 'use strict';
 function knows(records,id){return !!(records[id] && records[id].stage==='understood');}
 function record(records,definitions,evidence,hunt,site){
  Object.keys(definitions).forEach(function(id){
   var def=definitions[id];if(!Object.prototype.hasOwnProperty.call(def.evidence,evidence))return;
   var r=records[id] || (records[id]={stage:'impression',counts:{},last:{},hunts:0,lastHunt:-1,sites:[]});
   if(r.last[evidence]===hunt || r.stage==='understood')return;
   r.last[evidence]=hunt;r.counts[evidence]=Math.min(10,(r.counts[evidence]||0)+1);
   if(r.lastHunt!==hunt){r.hunts=Math.min(10,r.hunts+1);r.lastHunt=hunt;}
   if(r.sites.indexOf(site)<0 && r.sites.length<4)r.sites.push(site);
   var enough=Object.keys(def.evidence).every(function(k){return (r.counts[k]||0)>=def.evidence[k];});
   r.stage=enough && r.hunts>=(def.hunts||1) && r.sites.length>=(def.sites||1)?'understood':r.hunts>1?'studying':'impression';
  });
 }
 function validate(records,definitions){
  if(records==null)return true;
  if(typeof records!=='object'||Array.isArray(records))return false;
  return Object.keys(records).every(function(id){
   var r=records[id],d=definitions[id];
   return d && r && ['impression','studying','understood'].indexOf(r.stage)>=0 && Number.isInteger(r.hunts)&&r.hunts>=0&&r.hunts<=10&&Number.isInteger(r.lastHunt)&&r.lastHunt>=-1&&
    r.counts && r.last && Array.isArray(r.sites)&&r.sites.length<=4&&r.sites.every(function(x){return typeof x==='string';})&&
    Object.keys(r.counts).every(function(k){return Object.prototype.hasOwnProperty.call(d.evidence,k)&&Number.isInteger(r.counts[k])&&r.counts[k]>=0&&r.counts[k]<=10;})&&
    Object.keys(r.last).every(function(k){return Object.prototype.hasOwnProperty.call(d.evidence,k)&&Number.isInteger(r.last[k])&&r.last[k]>=0;});
  });
 }
 global.HuntingKnowledge={knows:knows,record:record,validate:validate};
})(typeof window!=='undefined'?window:globalThis);
