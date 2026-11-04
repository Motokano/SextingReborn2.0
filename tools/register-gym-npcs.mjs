import fs from 'node:fs';
import {STATIONS} from './gym-prototype-data.mjs';
import {GYM_FOOTPRINTS} from './gym-art.mjs';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function writeJson(file,value){const text=JSON.stringify(value,null,2)+'\n';if(!fs.existsSync(file)||fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')!==text)fs.writeFileSync(file,text);}
const layout=read('data/gym-layout.json'),registry=read('data/npc/npc_registry.json');
for(const s of STATIONS){
  const p=layout.stations.find(p=>p.id===s.id),id='npc.station.gym_'+s.id+'_base',file='data/npc/npc_station_gym_'+s.id+'_base.json';
  const def={schemaVersion:1,id,name:s.name,displayTitle:s.name,npcLabel:s.name,appearanceSchedule:{start:'00:00',end:'00:00'},location:{sceneId:layout.mapId,x:p.x,y:p.y},interactionChecks:{thirst:false,dirtyness:false},mainMenu:{showChat:false,showWorkWhen:'never',showLeave:true},gymStation:{id:s.id,footprint:GYM_FOOTPRINTS[s.id]},behavior:{type:'workbench',origin:'base_hideout'},tags:['workbench','gym_station','non_combat','base_facility']};
  writeJson(file,def);
  registry.npcs[id]={def:file,triggers:'data/npc/npc_gym_station_triggers.json'};
}
writeJson('data/npc/npc_gym_station_triggers.json',{entries:[]});
writeJson('data/npc/npc_registry.json',registry);
console.log('Registered 8 gym facility NPCs.');
