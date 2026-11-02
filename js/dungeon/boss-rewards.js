/* Per-instance boss rewards. Empty overrides retain the existing finite pool. */
(()=>{'use strict';
 const containerIds=['den-private','den-basket'];
 const fail=message=>{throw Error('头目掉落配置：'+message);};
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 function profile(value,rarities,itemExists){
  if(value===undefined)return;
  if(!object(value)||Object.keys(value).some(k=>!['inheritSharedPool','extraDrops'].includes(k)))fail('未知奖励字段');
  if(typeof value.inheritSharedPool!=='boolean'||!Array.isArray(value.extraDrops)||value.extraDrops.length>128)fail('需要共享池开关与额外掉落数组');
  for(const row of value.extraDrops){
   if(!object(row)||Object.keys(row).some(k=>!['item_id','chance','min','max','rarity'].includes(k)))fail('未知物品字段');
   if(typeof row.item_id!=='string'||!row.item_id||itemExists&&!itemExists(row.item_id))fail('物品ID不存在：'+row.item_id);
   if(!Number.isFinite(row.chance)||row.chance<0||row.chance>1)fail('单项概率必须为0～1');
   if(!Number.isSafeInteger(row.min)||!Number.isSafeInteger(row.max)||row.min<1||row.max<row.min||row.max>100000)fail('数量范围无效');
   if(!Object.hasOwn(rarities,row.rarity))fail('未知搜索稀有度：'+row.rarity);
  }
 }
 function validate(boss,rarities,itemExists){
  if(!boss)return;
  const chance=boss.spawnChance??1;
  if(!Number.isFinite(chance)||chance<0||chance>1)fail('出现率必须为0～1');
  if(boss.loot===undefined)return;
  const loot=boss.loot;
  if(!object(loot)||Object.keys(loot).some(k=>!['corpse','containers'].includes(k)))fail('未知掉落来源');
  profile(loot.corpse,rarities,itemExists);
  if(loot.containers!==undefined){
   if(!object(loot.containers)||Object.keys(loot.containers).some(k=>!containerIds.includes(k)))fail('未知特殊容器');
   for(const value of Object.values(loot.containers))profile(value,rarities,itemExists);
  }
 }
 function attach(target,value){if(value!==undefined)target.lootOverride=JSON.parse(JSON.stringify(value));}
 function extras(value,rng=Math.random){
  const items=[];
  for(const row of value?.extraDrops||[]){
   if(rng()>=row.chance)continue;
   const count=row.min+Math.floor(rng()*(row.max-row.min+1));
   items.push({item_id:row.item_id,count,rarity:row.rarity,revealed:false,claimed:false,ticks:0});
  }
  return items;
 }
 globalThis.DungeonBossRewards={validate,profile,attach,extras};
})();
