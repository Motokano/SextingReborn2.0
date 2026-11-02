/* Per-dungeon recipe scopes. Shared validation for the runtime and local editor. */
(()=>{'use strict';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys;
function validateStudy(value){
 if(!exact(value,'chance,enabled,recipeIds'))throw Error('资料台范围只能包含投放开关、整次出征出现率和配方清单');
 return RuinsRecipeStudy.validateConfig(value);
}
function validate(data){
 if(!exact(data,'dungeons,version')||data.version!==2||!Array.isArray(data.dungeons)||!data.dungeons.length||data.dungeons.length>100)throw Error('地牢配方范围目录无效');
 const ids=new Set(),names=new Set();
 for(const entry of data.dungeons){
  if(!exact(entry,'id,name,recipeStudy')||typeof entry.id!=='string'||!/^[a-z][a-z0-9_-]{0,63}$/.test(entry.id)||ids.has(entry.id))throw Error('地牢编号无效或重复');
  if(typeof entry.name!=='string'||!entry.name.trim()||entry.name!==entry.name.trim()||entry.name.length>40||names.has(entry.name.toLowerCase()))throw Error('地牢名称须为1～40个字符且不能重复');
  validateStudy(entry.recipeStudy);ids.add(entry.id);names.add(entry.name.toLowerCase());
 }
 return data;
}
function forDungeon(data,id){
 validate(data);const entry=data.dungeons.find(d=>d.id===id);
 if(!entry)throw Error('未配置此地牢的配方范围：'+id);
 return JSON.parse(JSON.stringify(entry.recipeStudy));
}
globalThis.DungeonRecipeRanges={validate,validateStudy,forDungeon};
})();
