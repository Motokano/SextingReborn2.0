/* Persistent recipe knowledge, independent of inventory and prototype saves. */
(()=>{'use strict';
const catalog=globalThis.ManufacturingKnowledgeCatalog.recipes;
const byId=new Map(catalog.map(r=>[r.id,r]));
let learned=new Set();
function basic(r){return r?.unlock==='skill_level'&&r.level===1&&(globalThis.InventoryEquipment?.getSkillLevel(r.skillId)||0)>=1;}
function legacy(r){return r?.id==='existing_hunting.consumable_hunting_snare'&&globalThis.Hunting?.knows('snare_tightening')&&globalThis.Hunting?.knows('snare_anchor');}
function knows(id){const r=byId.get(id);return !!r&&(learned.has(id)||basic(r)||!!legacy(r)||r.unlock==='any_known_recipe'&&r.linkedRecipes.some(key=>key!==id&&knows(key)));}
function grant(id){if(!byId.has(id)||knows(id))return false;learned.add(id);return true;}
function getState(){for(const r of catalog)if(knows(r.id))learned.add(r.id);return{version:1,learned:[...learned].sort()};}
function validate(value){return value==null||value.version===1&&Array.isArray(value.learned)&&value.learned.length<=catalog.length&&new Set(value.learned).size===value.learned.length&&value.learned.every(id=>typeof id==='string'&&byId.has(id));}
function restore(value){if(!validate(value))throw Error('无效制作知识存档');learned=new Set(value?.learned||[]);}
globalThis.ManufacturingKnowledge={catalog,recipe:id=>byId.get(id),knows,grant,getState,validate,restore};
})();
