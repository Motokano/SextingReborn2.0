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
    const equippedStepTotal = Number((stamina - S.getStamina()).toFixed(2));
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
    S.setState({stamina:0,fatigue:0});
    g.SceneCtx.actions.tryMoveTo(3,3,0,-1);
    assert.deepEqual([E.getState().x,E.getState().y],[3,3],'exhausted player moves normally');
    assert.equal(S.getStamina(),0);
    assert.equal(S.getFatigue(),2 * equippedStepTotal,'the equipped step converts once');
    const exhaustedTick=ticks(g);
    g.SceneCtx.actions.tryMoveTo(4,2,1,-1);
    assert.equal(ticks(g),exhaustedTick,'a wall rejects the step at zero stamina');
    assert.equal(S.getFatigue(),2 * equippedStepTotal);
    S.setState({stamina:0.1,fatigue:0});
    assert.equal(g.SceneCtx.actions.waitInPlace(),true);
    const partialFatigue = Number((0.01 + 2 * (0.4 - 0.1)).toFixed(2));
    assert.equal(S.getFatigue(),partialFatigue,'pay the first 0.1 from stamina, convert only the shortfall');
    const saved = copy(g.SaveSystem.buildSnapshotForDebug());
    delete saved.player.survival.fatigueFullTicks;
    delete saved.player.survival.fatigueComaTicksRemaining;
    Object.assign(saved.player.survival, {isComa:true, staminaZeroTicks:0, fatigue:99.9});
    const buffs = saved.buffs.instancesByOwner;
    buffs.player = buffs.player.filter(buff => buff.buff_id !== 'survival_stamina_exhausted');
    buffs.player.push({buff_id:'survival_coma', started_tick:ticks(g), expires_at_tick:ticks(g)+10, stacks:1});
    assert.equal(g.SaveSystem.applySnapshotForDebug(saved),true);
    assert.equal(ticks(g),exhaustedTick+1,'loading costs no time');
    assert.equal(S.getStamina(),0);
    assert.equal(S.getFatigue(),99.9);
    assert.equal(g.SceneAccess.isPlayerComaActive(),false);
    assert.equal(g.BuffSystem.hasBuffByBuffId('player','survival_stamina_exhausted'),true);
    const migrated = g.SaveSystem.buildSnapshotForDebug();
    assert.equal(migrated.player.survival.isComa,false);
    assert.equal('staminaZeroTicks' in migrated.player.survival,false);
    assert.equal(migrated.buffs.instancesByOwner.player.some(buff => buff.buff_id === 'survival_coma'),false);
    g.SceneCtx.actions.tryMoveTo(3,4,0,1);
    assert.deepEqual([E.getState().x,E.getState().y],[3,4],'first action after loading can move');
    assert.equal(S.getFatigue(),100);
    g.SceneCtx.actions.tryMoveTo(3,3,0,-1);
    assert.deepEqual([E.getState().x,E.getState().y],[3,3],'movement continues at maximum fatigue');
    assert.equal(ticks(g),exhaustedTick+3);
    S.setState({fatigue:100, fatigueFullTicks:28});
    g.SceneCtx.actions.waitInPlace();
    const warningSave = copy(g.SaveSystem.buildSnapshotForDebug());
    assert.equal(warningSave.player.survival.fatigueFullTicks,29);
    assert.equal(g.SaveSystem.applySnapshotForDebug(warningSave),true);
    g.SceneCtx.actions.waitInPlace();
    assert.equal(S.getState().fatigueComaTicksRemaining,10);
    const collapsedAt = ticks(g);
    g.SceneCtx.actions.tryMoveTo(3,4,0,1);
    assert.deepEqual([E.getState().x,E.getState().y],[3,3]);
    assert.equal(g.BuffSystem.hasActionDisabled('player','item_use'),true);
    assert.equal(g.SceneAccess.isPlayerComaActive(),true);
    assert.equal(ticks(g),collapsedAt,'blocked step does not advance the coma');
    for (let i=0;i<4;i++) g.SceneCtx.actions.waitInPlace();
    const comaSave = copy(g.SaveSystem.buildSnapshotForDebug());
    assert.equal(comaSave.player.survival.fatigueComaTicksRemaining,6);
    assert.equal(g.SaveSystem.applySnapshotForDebug(comaSave),true);
    const comaBuff = g.BuffSystem.getState().instancesByOwner.player.find(b => b.buff_id === 'survival_fatigue_coma');
    assert.equal(comaBuff.expires_at_tick-ticks(g),6,'HUD time agrees with the restored wake tick');
    for (let i=0;i<5;i++) g.SceneCtx.actions.waitInPlace();
    assert.equal(S.getState().fatigueComaTicksRemaining,1);
    assert.equal(S.getFatigue(),100);
    g.document.dispatchEvent(new g.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
    assert.equal(ticks(g),collapsedAt+10,'Space advances the last coma tick exactly once');
    assert.equal(S.isComa(),false);
    assert.equal(S.getFatigue(),90);
    assert.equal(S.getStamina(),0);
    assert.equal(g.BuffSystem.hasBuffByBuffId('player','survival_fatigue_coma'),false);
    g.SceneCtx.actions.tryMoveTo(3,4,0,1);
    assert.deepEqual([E.getState().x,E.getState().y],[3,4]);
    assert.equal(S.getFatigue(),90+2*equippedStepTotal);
    assert.equal(g.SaveSystem.applySnapshotForDebug(comaSave),true);
    assert.equal(g.SaveSystem.applySnapshotForDebug(saved),true);
    assert.equal(S.getState().fatigueFullTicks,0);
    assert.equal(S.isComa(),false,'legacy save does not inherit timers from current game');
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
    const A=g.AgricultureMap,st=A.ensureState(),plot=()=>A.cell(A.getState(),3,3),I=g.InventoryEquipment;
    st.task=null;plot().kind='land';plot().tilled=true;
    const crop={cropId:'maize',harvestItemId:'crop_maize',harvestItemName:'玉米',settled:true,harvestCount:3,result:'normal'};
    plot().crop=copy(crop);
    g.Survival.setState({stamina:100,fatigue:0});
    const started=ticks(g);
    let space=0,placed=0,proficiency=0;
    const realPut=I.putItemIntoDefaultContainer,realUsage=I.incrementSkillMoveUsage;
    I.putItemIntoDefaultContainer=()=>{if(space--<=0)return {placed:false};placed++;return {placed:true};};
    I.incrementSkillMoveUsage=(skill,move,n)=>{assert.equal(skill,'life_planting');assert.equal(move,'harvest');proficiency+=n;};
    try {
      assert.equal(g.SceneApp.tryAgricultureAction('harvest',{x:3,y:3}).reason,'inventory_full');
      assert.equal(plot().crop.harvestCount,3);assert.equal(proficiency,0);assert.equal(ticks(g),started);
      assert.equal(g.Survival.getStamina(),100);
      space=2;const partial=g.SceneApp.tryAgricultureAction('harvest',{x:3,y:3});
      assert.equal(partial.placedCount,2);assert.equal(plot().crop.harvestCount,1);assert.equal(proficiency,2);
      assert.equal(ticks(g),started+1);assert.equal(g.Survival.getStamina(),99.4);
      space=1;assert.equal(g.SceneApp.tryAgricultureAction('harvest',{x:3,y:3}).placedCount,1);
      assert.equal(plot().crop,null);assert.equal(placed,3);assert.equal(proficiency,3);
      plot().crop={...crop,harvestCount:0,result:'withered'};
      assert.equal(g.SceneApp.tryAgricultureAction('harvest',{x:3,y:3}).ok,true);
      assert.equal(plot().crop,null);assert.equal(placed,3);assert.equal(proficiency,3);
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
