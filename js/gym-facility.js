/* NPC-facing gym facility adapter. The host supplies its state and panel;
   this module never creates a second menu, inventory, timer or save store. */
(function(g){
  'use strict';
  var host=null,ids=['floor','pullup','dumbbell','barbell','cable','leg','handsfeet','neck'];
  function idOf(def){var id=def&&def.gymStation&&def.gymStation.id;return ids.indexOf(id)>=0&&def.id==='npc.station.gym_'+id+'_base'?id:null;}
  function at(def){
    var id=idOf(def);if(!host||!id)return false;
    var actor=host.position(),p=host.placement(id),size=def.gymStation.footprint;
    if(!actor||!p||actor.mapId!==def.location.sceneId||g.Survival&&(g.Survival.isDead()||g.Survival.getState().isComa))return false;
    if(actor.x>=p.x&&actor.x<p.x+size[0]&&actor.y>=p.y&&actor.y<p.y+size[1])return false;
    for(var y=0;y<size[1];y++)for(var x=0;x<size[0];x++)if(Math.abs(actor.x-p.x-x)+Math.abs(actor.y-p.y-y)===1)return true;
    return false;
  }
  function actions(def){
    if(!at(def))return [];
    var id=idOf(def),busy=host.job(),owner=busy&&(busy.kind==='train'?host.action(busy.actionId).station:'bed');
    if(!host.level(id))return [{id:'build',text:'建造',icon:'plus',disabled:!!busy}];
    return [{id:'train',text:owner===id?'查看训练':'训练',icon:'stamina',disabled:!!busy&&owner!==id},
      {id:'upgrade',text:'升级',icon:'arrow',disabled:!!busy}];
  }
  g.GymFacility={
    bind:function(adapter){host=adapter;},
    npcId:function(id){return ids.indexOf(id)>=0?'npc.station.gym_'+id+'_base':null;},
    isAt:at,actions:actions,
    open:function(def,action){
      if(!at(def)||!actions(def).some(function(a){return a.id===action&&!a.disabled;}))return false;
      return host.open(idOf(def),action)!==false;
    }
  };
})(typeof window!=='undefined'?window:globalThis);
