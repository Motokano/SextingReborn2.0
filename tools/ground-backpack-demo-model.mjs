// PROTOTYPE: can spatial ground-bag access, explicit destinations and whole-bag swaps
// be understood by playing? Uses production catalog/inventory helpers, memory only.
export function createGroundBackpackDemo(g) {
 const I=g.InventoryEquipment,B=g.BackpackSystem,copy=x=>JSON.parse(JSON.stringify(x));
 const fail=m=>{throw Error(m);}, count=x=>x?.count??1;
 let world,selected=null,opened=false,failNext=false,checkpoint=null;
 const name=x=>{const t=I.getItemTemplate(x?.item_id)||{};return t.name||t.name_0||t.sn||x?.item_id||'空';};
 const item=(id,n=1)=>I.ensureItemInstanceIdentity({item_id:id,count:n});
 const bag=id=>B.generate('eq_backpack_'+id);
 const pos=()=>({mapId:world.mapId,x:world.x,y:world.y});
 g.GameEngine={getState:pos,getMaps:()=>({[world.mapId]:{is_dungeon:world.dungeon}})};
 g.Survival={getState:()=>({tickCount:world.tick,isDead:world.dead}),isDead:()=>world.dead,setDiqiShieldRemaining:()=>{}};
 function list(s=I.getState()) {return Object.entries(s.ground_items).flatMap(([key,arr])=>{const m=key.match(/^(.*)_(-?\d+)_(-?\d+)$/);return !m?[]:arr.filter(Boolean).map(x=>({item:x,mapId:m[1],x:+m[2],y:+m[3]}));});}
 const target=(s=I.getState())=>list(s).find(r=>r.item.instance_id===selected);
 const blocked=(x,y)=>x<0||x>=6||y<0||y>=5||(x===3&&(y===1||y===3||(y===2&&!world.door)));
 function reachable(r=target()){return !!r&&!world.dead&&r.mapId===world.mapId&&!blocked(r.x,r.y)&&r.x===world.x&&r.y===world.y;}
 function requireTarget(s,bagOnly=false){const r=target(s);if(!r)fail('物品已离开地面。');if(!reachable(r))fail(world.dead?'当前无法操作。':'与背包不在同一格。');if(bagOnly&&!B.managed(r.item.item_id))fail('目标不是背包。');return r;}
 function invalidate(){if(opened&&!reachable()){opened=false;return true;}return false;}
 function refs(s,c,r){if(c==='groundBag'){if(!r)fail('背包已不在地面。');return r.item.backpack_contents||(r.item.backpack_contents=[]);}return s['inventory_'+c]||fail('目的容器无效。');}
 function capacity(c,r){return c==='groundBag'?B.profile(r.item).slots:c==='backpack'?I.getBackpackSlots():c==='pocket'?I.getPocketSlots():c==='vehicle'?Infinity:0;}
 function put(s,c,x,r){
  if(c==='vehicle'&&!s.bound_vehicle_id)fail('载具不可用。');
  if(c!=='vehicle'&&I.hasPackedBackpackContents(x))fail('此容器不能收纳非空背包。');
  if(c==='pocket'&&!I.canFitPocket(x))fail('这件物品不能放入口袋。');
  const arr=refs(s,c,r),cap=capacity(c,r),t=I.getItemTemplate(x.item_id),limit=c==='pocket'?1:t.enchant_slots>0?1:Math.max(1,Number(t.stack_limit||t.stack_max)||1);
  const draft=copy(arr);let left=count(x),usedId=false;
  if(limit>1)for(const e of draft){if(e&&I.itemInstancesCanStack(e,x)&&count(e)<limit){const n=Math.min(left,limit-count(e));e.count=count(e)+n;e.spoilage_elapsed_ticks=Math.max(e.spoilage_elapsed_ticks||0,x.spoilage_elapsed_ticks||0);left-=n;if(!left)break;}}
  while(left){let at=draft.findIndex((e,i)=>i<cap&&!e);if(at<0){if(draft.length>=cap)fail('目的容器格数不足，物品留在原处。');at=draft.length;}
   const next=copy(x);next.count=Math.min(limit,left);delete next.ground_drop_tick;if(usedId)I.reissueItemInstanceId(next);usedId=true;draft[at]=next;left-=next.count;
  }
  arr.splice(0,arr.length,...draft);
 }
 function take(arr,id,n){const at=arr.findIndex(x=>x?.instance_id===id),x=arr[at];if(!x)fail('物品已经移动。');if(!Number.isInteger(n)||n<1||n>count(x))fail('数量无效。');const result=copy(x);result.count=n;if(n===count(x))arr[at]=null;else{x.count-=n;I.reissueItemInstanceId(result);}delete result.ground_drop_tick;return result;}
 function ground(s,x,p){delete x.ground_drop_tick;x.ground_drop_tick=world.tick;const key=I.getGroundItemKey(p.mapId,p.x,p.y);(s.ground_items[key]??=[]).push(x);}
 function removeGround(s,r){const arr=s.ground_items[I.getGroundItemKey(r.mapId,r.x,r.y)];arr.splice(arr.findIndex(x=>x?.instance_id===r.item.instance_id),1);delete r.item.ground_drop_tick;return r.item;}
 function validateUnique(s){const seen=new Set();function visit(x){if(!x?.item_id)return;if(!x.instance_id||seen.has(x.instance_id))fail('物品身份冲突，操作已撤回。');seen.add(x.instance_id);I.getItemInstanceChildren(x).forEach(c=>visit(c.instance));}Object.values(s.equipment).forEach(visit);['pocket','vest','backpack','vehicle'].forEach(c=>s['inventory_'+c].forEach(visit));Object.values(s.ground_items).forEach(a=>a.forEach(visit));}
 function transact(fn){const before=copy(I.getState()),meta=copy({world,selected,opened});try{if(world.dead)fail('角色已失去操作能力。');const s=copy(before),message=fn(s);s.item_identity=copy(I.getState().item_identity);validateUnique(s);I.setState(s);if(failNext){failNext=false;fail('模拟保存失败：本次操作已全部恢复原位。');}invalidate();checkpoint=copy({inventory:I.getState(),world});return {ok:true,message};}catch(e){I.setState(before);({world,selected,opened}=meta);return {ok:false,message:e.message};}}
 function reset(scenario='start'){
  world={mapId:scenario==='dungeon'?'demo_dungeon':'demo_yard',dungeon:scenario==='dungeon',x:1,y:2,tick:0,door:false,dead:false};selected=null;opened=false;failNext=false;
  I.setState({equipment:{},inventory_backpack:[],inventory_pocket:[],inventory_vest:[],inventory_vehicle:[],bound_vehicle_id:'demo_cart',ground_items:{},skills:{}});
  const flask=item('tool_flask_iron_water');I.setItemInstanceValue(flask,'flask_water',125);
  const food=item('food_flatbread_plain',2);food.spoilage_elapsed_ticks=40;
  const first=bag('light_canvas'),collect=bag('multi_pocket'),hauler=bag('frame_hauler');collect.backpack_contents=[item('textile_cotton_cloth',3),null,item('material_iron_blank_common',2)];hauler.backpack_contents=[item('material_iron_blank_common',6)];
  const s=I.getState();s.equipment={clothing:item('eq_clothing_combat_suit'),backpack:first};s.inventory_backpack=[item('material_iron_blank_common',3),flask,null,food,bag('light_canvas')];s.inventory_pocket=[item('textile_cotton_cloth')];
  ground(s,collect,{...pos(),x:2,y:2});ground(s,hauler,{...pos(),x:4,y:2});s.item_identity=copy(I.getState().item_identity);I.setState(s);
  if(scenario!=='start'){const r=drop();selected=r.id||selected;opened=true;}
  if(scenario==='full'){const full=bag('multi_pocket');I.equip('backpack',full);const st=I.getState();st.inventory_backpack=Array.from({length:23},()=>item('tool_flask_iron_water'));st.item_identity=copy(I.getState().item_identity);I.setState(st);}
  if(scenario==='swap'){const st=I.getState(),r=list(st).find(v=>v.item.instance_id===collect.instance_id),next=removeGround(st,r);st.equipment.backpack=next;st.inventory_backpack=next.backpack_contents;delete next.backpack_contents;I.setState(st);}
  if(scenario==='empty'){const st=I.getState();target(st).item.backpack_contents=[];I.setState(st);}
  if(scenario==='expiry')world.tick=98;
  checkpoint=copy({inventory:I.getState(),world});return {ok:true,message:''};
 }
 function drop(){let id;const r=transact(s=>{const b=s.equipment.backpack;if(!b)fail('当前没有装备背包。');b.backpack_contents=s.inventory_backpack;s.inventory_backpack=[];s.equipment.backpack=null;ground(s,b,pos());selected=id=b.instance_id;opened=false;return '整包已放在脚下，内容和格位全部保留。';});return {...r,id};}
 function select(id){selected=id;opened=false;const r=target();return {ok:!!r,message:r?`已选中${name(r.item)}。`:'物品已经离开地面。'};}
 function open(){try{requireTarget(I.getState(),true);opened=true;return {ok:true,message:''};}catch(e){return {ok:false,message:e.message};}}
 function transfer(direction,id,n,c){return transact(s=>{const r=requireTarget(s,true);if(!opened)fail('背包未打开。');const source=direction==='in'?c:'groundBag',destination=direction==='in'?'groundBag':c;const x=take(refs(s,source,r),id,n);if(direction==='ground')ground(s,x,r);else put(s,destination,x,r);return `${name(x)} × ${n} 已${direction==='in'?'放入背包':direction==='ground'?'放在背包所在格':'取出'}。`;});}
 function takeAll(c){return transact(s=>{const r=requireTarget(s,true);if(!opened)fail('背包未打开。');const ids=refs(s,'groundBag',r).filter(Boolean).map(x=>x.instance_id);let moved=0,last='';for(const id of ids){const before=copy(s);try{const live=target(s),x=refs(s,'groundBag',live).find(x=>x?.instance_id===id);put(s,c,take(refs(s,'groundBag',live),id,count(x)),live);moved++;}catch(e){Object.assign(s,before);last=e.message;}}return `已取出 ${moved} 格，原包剩余 ${refs(s,'groundBag',target(s)).filter(Boolean).length} 格。${last}`;});}
 function equip(){return transact(s=>{const r=requireTarget(s,true),b=removeGround(s,r),old=s.equipment.backpack;if(old){old.backpack_contents=s.inventory_backpack;ground(s,old,pos());}s.equipment.backpack=b;s.inventory_backpack=b.backpack_contents||[];delete b.backpack_contents;opened=false;return old?'新包已背上；旧包连原有内容留在脚下。':'已背上此包。';});}
 function pickup(c){return transact(s=>{const r=requireTarget(s);put(s,c,removeGround(s,r));opened=false;return `已将${name(r.item)}整体收起。`;});}
 function dropCarried(id,n,c){return transact(s=>{const x=take(refs(s,c),id,n);ground(s,x,pos());selected=x.instance_id;opened=false;return '已放在人物脚下。';});}
 function tick(n){for(let i=0;i<n;i++){world.tick++;g.HideoutWarehouse.tickSpoilage();I.pruneExpiredGroundItems(world.tick,100);}return invalidate();}
 function wait(n){return transact(s=>{I.setState(s);const closed=tick(n);Object.assign(s,copy(I.getState()));return `经过 ${n} 刻。${closed?'地面窗口已失效并关闭。':''}`;});}
 function pathTo(x,y){if(blocked(x,y))return null;const q=[[world.x,world.y,[]]],seen=new Set();while(q.length){const [a,b,path]=q.shift(),key=a+','+b;if(seen.has(key))continue;seen.add(key);if(a===x&&b===y)return path;for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]])if(!blocked(a+dx,b+dy))q.push([a+dx,b+dy,[...path,{x:a+dx,y:b+dy}]]);}return null;}
 function step(x,y){return transact(s=>{if(blocked(x,y)||Math.abs(world.x-x)+Math.abs(world.y-y)!==1)fail('这一步被阻挡。');world.x=x;world.y=y;I.setState(s);const closed=tick(1);Object.assign(s,copy(I.getState()));return `走到（${x+1}, ${y+1}），经过1刻。${closed?'已离开背包所在格，窗口关闭。':''}`;});}
 function approach(){const r=target();return r?pathTo(r.x,r.y):null;}
 function toggleDoor(){if(world.door&&world.x===3&&world.y===2)return {ok:false,message:'人物占用门格。'};world.door=!world.door;invalidate();return {ok:true,message:world.door?'门已打开。':'门已关闭。'};}
 function death(){I.clearAllOnDeath();world.dead=true;opened=false;checkpoint=copy({inventory:I.getState(),world});return {ok:true,message:'已模拟死亡：随身及载具清空，先前地面物品保留。'};}
 function reload(){if(!checkpoint)return {ok:false,message:'暂无试玩记录。'};I.setState(copy(checkpoint.inventory));world=copy(checkpoint.world);opened=false;selected=null;return {ok:true,message:'已恢复本次试玩最近一次提交，地面窗口保持关闭。'};}
 function snapshot(){return {world:copy(world),inventory:copy(I.getState()),ground:list(),selected,opened,failNext,target:target(),reachable:reachable(),weight:I.getCurrentCarryWeight()};}
 return {reset,drop,select,open,close:()=>{opened=false;return {ok:true,message:'已关闭，背包留在原地。'};},transfer,takeAll,equip,pickup,dropCarried,wait,pathTo,step,approach,toggleDoor,death,reload,snapshot,blocked,name,capacity,failSave:()=>{failNext=true;return {ok:true,message:'下一次改变物品或时间的操作将模拟保存失败。'};}};
}
