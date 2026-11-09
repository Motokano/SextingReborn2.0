import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
const ticks = g => g.GameTime.getState().totalTicks;
async function createPlayer(h) {
  const g = h.g;
  g.DialogueUI.close();
  g.SceneApp.openCharacterCreationAfterIntro();
  await h.drain();
  assert.equal(g.SceneApp.creation.confirm({name:'入口迁移回归',height:178,gender:'male',hand:'right',leg:'right'}),true);
  await h.drain();g.DialogueUI.close();
}

for (const full of [false, true]) test(`scene entry ${full?'Svelte':'classic'}: public wiring, movement, waiting and leap preserve time and resources`, async () => {
  const h = await boot(full), g = h.g;
  try {
    await createPlayer(h);
    assert.equal(g.SceneCtx.actions.attackEnemy, g.CombatExchange.attackEnemy);
    assert.equal(g.SceneCtx.actions.tryMoveTo, g.SceneMovement.tryMoveTo);
    assert.equal(g.SceneApp.tryUseItemFromContainer, g.ItemUseActions.tryUseItemFromContainer);
    assert.equal(g.SceneApp.tryAgricultureAction, g.AgricultureActions.tryAgricultureAction);
    const E=g.GameEngine, S=g.Survival, I=g.InventoryEquipment;
    E.setMaps({...E.getMaps(),scene_entry_test:{map_id:'scene_entry_test',name:'测试',width:9,height:9,blocks:[{x:4,y:2}],disabled:[],enemies:[],npcs:[],portals:[]}});
    E.setState('scene_entry_test',2,2);S.setState({stamina:100,isDead:false});
    const t=ticks(g), stamina=S.getState().stamina;
    assert.equal(g.SceneCtx.actions.turnToward(1,0),true);assert.equal(ticks(g),t);
    g.SceneCtx.actions.tryMoveTo(3,2,1,0);
    assert.deepEqual([E.getState().x,E.getState().y],[3,2]);assert.equal(ticks(g),t+1);
    assert(S.getState().stamina<stamina,'movement still pays stamina');
    const blocked=copy(S.getState());g.SceneCtx.actions.tryMoveTo(4,2,1,0);
    assert.equal(ticks(g),t+1);assert.deepEqual(copy(S.getState()),blocked,'blocked step pays nothing');
    assert.equal(g.SceneCtx.actions.waitInPlace(),true);assert.equal(ticks(g),t+2);
    I.getSkillsState().combat_basic_footwork.level=60;
    I.setCombatState({hubs:{footwork:'combat_basic_footwork'}});
    I.setHubActionCooldownRemaining('combat_basic_footwork','nie_bu',0);
    g.SceneCtx.footworkNieBuMode=true;
    assert.equal(g.SceneCtx.actions.tryFootworkNieBuJump(3,4),true);
    assert.deepEqual([E.getState().x,E.getState().y],[3,4]);assert.equal(ticks(g),t+3,'leap pays exactly one tick');
    assert(I.getHubActionCooldownRemaining('combat_basic_footwork','nie_bu')>0);
    assert.equal(g.SceneCtx.footworkNieBuMode,false);
    g.SceneCtx.footworkNieBuMode=true;
    assert.equal(g.SceneCtx.actions.tryFootworkNieBuJump(3,5),false,'cooldown rejects second leap');
    assert.equal(ticks(g),t+3);
    assert.deepEqual(h.errors,[]);
  } finally { await h.close(); }
});

test('agriculture action owns full/partial/zero harvest and planting proficiency through the formal entry',async()=>{
  const h=await boot(false),g=h.g;
  try {
    await createPlayer(h);
    g.GameEngine.setState('M0_Base_Outside_lv_1',5,10);
    g.NPCSystem.setDemoFlag('facility_restored:agriculture',true);
    g.SceneCtx.agriculture_unlocked=true;
    const A=g.AgricultureMap,st=A.ensureState(),plot=A.cell(st,3,3),I=g.InventoryEquipment;
    st.task=null;plot.kind='land';plot.tilled=true;
    const crop={cropId:'maize',harvestItemId:'crop_maize',harvestItemName:'玉米',settled:true,harvestCount:3,result:'normal'};
    plot.crop=copy(crop);
    let space=0,placed=0,proficiency=0;
    const realPut=I.putItemIntoDefaultContainer,realUsage=I.incrementSkillMoveUsage;
    I.putItemIntoDefaultContainer=()=>{if(space--<=0)return {placed:false};placed++;return {placed:true};};
    I.incrementSkillMoveUsage=(skill,move,n)=>{assert.equal(skill,'life_planting');assert.equal(move,'harvest');proficiency+=n;};
    try {
      assert.equal(g.SceneApp.tryAgricultureAction('harvest',{x:3,y:3}).reason,'inventory_full');
      assert.deepEqual(copy(plot.crop),crop);assert.equal(proficiency,0);
      space=2;const partial=g.SceneApp.tryAgricultureAction('harvest',{x:3,y:3});
      assert.equal(partial.placedCount,2);assert.equal(plot.crop.harvestCount,1);assert.equal(proficiency,2);
      space=1;assert.equal(g.SceneApp.tryAgricultureAction('harvest',{x:3,y:3}).placedCount,1);
      assert.equal(plot.crop,null);assert.equal(placed,3);assert.equal(proficiency,3);
      plot.crop={...crop,harvestCount:0,result:'withered'};
      assert.equal(g.SceneApp.tryAgricultureAction('harvest',{x:3,y:3}).ok,true);
      assert.equal(plot.crop,null);assert.equal(placed,3);assert.equal(proficiency,3);
    } finally {I.putItemIntoDefaultContainer=realPut;I.incrementSkillMoveUsage=realUsage;}
  } finally {await h.close();}
});

test('item route gates retain combat restrictions and live idle-state ownership',async()=>{
  const h=await boot(false),g=h.g;
  try {
    await createPlayer(h);
    const combat=g.CombatEngagement.isPlayerInCombat;
    g.CombatEngagement.isPlayerInCombat=()=>true;
    for(const route of ['topical','inject']) assert.equal(g.SceneAccess.checkUseRouteGate({use_action:route}).reason,'in_combat');
    for(const route of ['drink','inhale','pierce']) assert.equal(g.SceneAccess.checkUseRouteGate({use_action:route}),null);
    g.CombatEngagement.isPlayerInCombat=()=>false;
    g.PlayerActions.setRestingActionActive(true,{showMsg:false});
    assert.equal(g.SceneAccess.checkUseRouteGate({use_action:'inject'}).reason,'must_be_still');
    g.PlayerActions.setRestingActionActive(false,{showMsg:false});
    assert.equal(g.SceneAccess.checkUseRouteGate({use_action:'inject'}),null);
    g.CombatEngagement.isPlayerInCombat=combat;
  } finally {await h.close();}
});
