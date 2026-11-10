// Companion structures for the accepted botanical prototype style.
// Draw order: rear structure, crop, front structure. No paint-server IDs are shared.
import { renderCropArt } from './crop-art.mjs';
const p=(d,fill)=>`<path d="${d}" fill="${fill}"/>`;
const l=(d,stroke='#a89e70',width=2)=>`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const e=(x,y,rx,ry,fill)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const shade=e(50,89,39,5,'#142017');
const wood=(d)=>l(d,'#7d7950',4.5)+l(d,'#b3a576',2);
const art={
 support_frame:{
  crop:[13,16,.74],
  back:shade+wood('M18 87 35 14 65 14 83 87M35 14 34 85M65 14 66 85M27 44H73M22 66H78')+l('M35 15 66 44M65 15 34 44M28 44l39 22M72 44 33 66','#9a9c69',1.2)+l('M32 13h7m22 0h8M25 44l5 2m42-4 3 3','#d5c69b',1.3),
  front:wood('M18 87 35 14M65 14 83 87')+l('M22 68q28 5 56 0','#bcae7e',1.1)+l('m19 83 4 1m55-1 4-1','#dbcd9d',1.4)
 },
 protection_cage:{
  crop:[12,10,.76],
  back:shade+e(50,83,28,5,'#526a49')+wood('M27 85 30 27M73 85 70 27M50 83V18')+l('M29 31C31 15 69 15 71 31M27 53C30 40 70 40 73 53M26 75C30 64 70 64 74 75','#969c6c',2),
  front:l('M29 31C31 42 69 42 71 31M27 53C30 67 70 67 73 53M26 75C30 88 70 88 74 75','#bcb387',2.4)+l('M27 32 25 85M73 32 75 85','#9c9b70',2)+l('M29 33 29 37M72 55l1 5M26 76l1 5','#e0d0a1',1.4)
 },
 binding_strap:{
  crop:[6,4,.88],
  back:shade+wood('M23 87 28 14M77 87 72 14')+l('M26 26h5m-6 17h5m-7 17h6m41-34h5m-4 17h6m-4 17h6','#d1c58b',1.3),
  front:l('M25 59q24 9 50 0M25 63q24 9 50 0M22 78q28 7 56 0','#c6b88b',2)+p('M67 60l7-4 5 4-5 5Z','#ae9a6c')+l('m73 62 4 10m-4-10-5 8','#d7c69b',1.4)
 },
 water_storage_ridge:{
  crop:[11,7,.78],
  back:shade+p('M9 72Q11 60 50 58 88 59 91 72v9Q87 94 50 95 13 94 9 81Z','#706a47')+e(50,73,41,15,'#a39465')+e(50,72,33,10,'#416d5b')+e(50,70,30,7,'#638d70')+l('M19 73q12-4 23-2m19-4h12m-6 8 12-1','#a6bd91',1.2),
  front:p('M9 73Q16 87 50 87 84 87 91 73v8Q86 94 50 95 13 94 9 81Z','#8d7e51')+l('M14 78q35 21 72 0','#bdac75',3)+l('M23 85l-1 4m20-1v3m21-3 2 3m14-8 2 3','#6a6648',1.2)
 },
 deep_pool:{
  crop:[10,2,.8],
  back:shade+p('M9 69 19 60 49 55 80 60 91 70 89 85 74 94H26L11 85Z','#69786c')+e(50,73,40,16,'#a0a68a')+e(50,72,33,11,'#284e4c')+e(50,70,29,7,'#44736b')+l('M22 71q8-3 18-2m23-3h11m-14 12 14-1','#83aea0',1.2)+l('M18 63 23 67M38 58l2 4M63 58l-2 4M82 65l-6 2','#62766b',1.7),
  front:p('M10 72Q21 89 50 88 80 89 90 72l-1 13-15 9H26L11 85Z','#778777')+l('M13 78q36 23 74 0','#bbc1a0',3)+l('M23 85v5M41 89v5M62 89v5M79 84v6','#516a61',1.6)+l('M26 90h8m13 2h8m14-2h6','#9eae90',1.1)
 },
 shade_cover:{
  crop:[19,29,.62],
  back:shade+wood('M17 87V29M83 87V29M50 64V15')+p('M14 31 50 12 86 31 86 75 78 82 73 38 27 38 22 82 14 76Z','#3c5145')+p('M14 31 26 37 23 81 14 76Z','#52694f')+l('M18 38 17 72M80 38l3 35','#7c8b65',1),
  front:p('M8 30 49 9 92 30 84 39Q69 40 50 33 30 42 15 39Z','#627857')+p('M8 30 49 9 50 33 16 38Z','#7c8a62')+l('M13 30 49 13 86 30M50 15v14','#a4aa7d',1.1)+l('M15 39q17 5 35-4 18 6 34 4','#a5ac7b',1)+wood('M17 86V40M83 86V40')+p('M15 42q9 2 12-3l-6 27-5-1Z','#4c634d')
 },
 canopy:{
  crop:[18,27,.64],
  back:shade+wood('M17 88V30M83 88V30M50 68V13')+l('M18 45 32 32M82 45 68 32','#9c9169',2.3),
  front:p('M7 29 49 10 93 29 83 38 49 30 17 38Z','#b1a174')+p('M7 29 49 10 49 30 17 38Z','#c9ba88')+p('M49 10 93 29 83 38 49 30Z','#a5996c')+l('M14 28 49 13 86 29M28 24l6 10M67 23l-5 10','#e0d1a1',1.2)+l('M17 39 49 32 83 39','#7f7f56',2)+wood('M17 87V40M83 87V40')+l('M14 80h6m60 0h6','#d1c494',1.5)
 }
};
export const structureArtIds=Object.freeze(Object.keys(art));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderPlotArt(cropId,structureId,klass=''){
 if(!structureId)return cropId?renderCropArt(cropId,klass):'';
 const a=art[structureId];if(!a)throw Error(`Missing crop structure artwork: ${structureId}`);
 const [x,y,scale]=a.crop;
 const crop=cropId?`<g transform="translate(${x} ${y}) scale(${scale})"><g class="au-crop-body">${renderCropArt(cropId).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')}</g></g>`:'';
 return `<svg xmlns="http://www.w3.org/2000/svg" class="au-botanical au-plot-art ${escape(klass)}" viewBox="0 0 100 100" data-structure="${escape(structureId)}" aria-hidden="true">${a.back}${crop}${a.front}</svg>`;
}
export const renderStructureArt=(id,klass='')=>renderPlotArt(null,id,klass);
export function structureArtFile(id,name,cropId=null){return renderPlotArt(cropId,id).replace('aria-hidden="true"','role="img"').replace(/(<svg[^>]*>)/,`$1<title>${escape(name)}</title>`);}
