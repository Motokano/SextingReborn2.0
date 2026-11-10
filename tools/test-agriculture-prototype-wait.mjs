import test from 'node:test';
import assert from 'node:assert/strict';
import { boot } from './ui-game-fixture.mjs';
import { advanceAgricultureWait } from './agriculture-wait-runtime.mjs';

test('prototype waiting shares real player costs and advances the owned farm exactly once', async () => {
  const h=await boot(false),g=h.g;
  try {
    g.DialogueUI.close();g.SceneApp.openCharacterCreationAfterIntro();await h.drain();
    assert.equal(g.SceneApp.creation.confirm({name:'农业等待回归',height:178,gender:'male',hand:'right',leg:'right'}),true);
    await h.drain();g.DialogueUI.close();
    g.GameEngine.setState('M0_Base_Outside_lv_1',5,10);
    for(const stage of ['cleaned','restored'])g.NPCSystem.setDemoFlag(`facility_${stage}:agriculture`,true);
    const A=g.AgricultureMap,farm=A.setState(A.createDefaultState());
    g.AgricultureActions.unlockAgriculture();
    const plot=A.cell(farm,2,2);plot.tilled=true;
    assert.equal(A.tryPlantCropAt(farm,{cropDefs:g.AgricultureActions.agricultureCropDefsDoc,soils:g.AgricultureActions.agricultureSoilsDoc},2,2,'maize').ok,true);
    A.cell(farm,10,10).kind='super_fusion';farm.power_charge=100;
    g.Survival.setState({stamina:80,fatigue:10,satiety:80,thirst:80,isResting:false,isDead:false,isComa:false});
    const initial=g.SaveSystem.buildSnapshotForDebug(),ticks=g.WorldTick.getWorldTotalTicks();
    const observe=()=>{
      const s=g.Survival.getState(),f=A.getState();
      return {player:Object.fromEntries(['stamina','fatigue','satiety','thirst','tickCount'].map(k=>[k,s[k]])),world:g.WorldTick.getWorldTotalTicks(),farmTick:f.tick,power:f.power_charge,remaining:A.cell(f,2,2).crop.remainingTicks};
    };
    for(let i=0;i<4;i++)assert.equal(g.SceneMovement.waitInPlace(),true);
    const expected=observe();
    assert.equal(g.SaveSystem.applySnapshotForDebug(initial),true);
    for(let i=0;i<4;i++){
      const result=advanceAgricultureWait(g);
      assert.equal(result.ok,true);assert.equal(result.stopped,false);assert.equal(result.state,A.getState());
    }
    assert.deepEqual(observe(),expected,'same character, world and farm result as four main-game waits');
    assert.equal(expected.world,ticks+4);assert.equal(expected.farmTick,ticks+4);assert.equal(expected.power,96);
    assert.ok(expected.player.stamina<80);assert.ok(expected.player.fatigue>10);
    // Replacing a farm after building/removal must keep the world consumer on that state.
    const rebuilt=A.previewChange(A.getState(),3,3,{task:{type:'build'}});
    assert.equal(rebuilt.ok,true);A.setState(rebuilt.state);
    const remaining=A.cell(rebuilt.state,2,2).crop.remainingTicks;
    assert.equal(advanceAgricultureWait(g).state,rebuilt.state);
    assert.equal(A.cell(rebuilt.state,2,2).crop.remainingTicks,remaining-1);
    let before=observe();g.GameEngine.setState('M0_Base_Inside_lv_1',13,14);
    assert.equal(advanceAgricultureWait(g).ok,false);assert.deepEqual(observe(),before,'no progress after leaving farm');
    g.GameEngine.setState('M0_Base_Outside_lv_1',5,10);g.Survival.setState({isDead:true});before=observe();
    assert.equal(advanceAgricultureWait(g).ok,false);assert.deepEqual(observe(),before,'no progress when dead');
    assert.deepEqual(h.errors,[]);
  } finally {await h.close();}
});
