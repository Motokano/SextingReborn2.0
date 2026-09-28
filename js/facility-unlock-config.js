(function(g){
'use strict';
var materials=[['ore_clay_raw','stone',2],['ore_limestone','stone',3],['ore_granite','stone',5],['wood_plank_soft','wood',4],['wood_bamboo_green','wood',2],['wood_pine','wood',3],['ore_scrap_metal','metal',2],['ore_cast_iron','metal',4],['ore_steel_ingot','metal',6],['hus_wool','fiber',1],['textile_coir','fiber',2],['supply_rope_hemp_short','fiber',3],['mechanical_parts','parts',4]];
var names={stone:'土石修补',wood:'木作加固',metal:'金属装配',fiber:'纤维绑扎',parts:'机件装配'};
function makeGroups(cost){return Object.keys(cost).filter(function(k){return cost[k]>0;}).map(function(k){return {id:k,name:names[k],note:names[k],need:cost[k]};});}
var projects={};
function add(id,title,cost,unlock,position,requires){projects[id]={id:id,title:title,groups:makeGroups(cost),unlock:unlock,position:position,requires:requires};}
add('cooking','修复烹饪台',{stone:10,wood:8},'cooking_base_station_unlocked',[12,15]);projects.cooking.key='cooking_base_repair_progress';
projects.cooking.groups[0].note='修补灶体与台基';projects.cooking.groups[1].note='加固支架与外框';
add('pharmacy','修复制药台',{stone:10,wood:8},'npc_station_pharmacy_base_repaired',[14,15]);
add('compost','修复制肥桶',{wood:8,stone:4,fiber:4},'npc_station_compost_base_repaired',[13,15]);
add('water','修复灶台供水',{stone:6,metal:8,parts:4},'cooking_base_station_water_unlimited',[12,15],'cooking_base_station_unlocked');
add('calendar','装配日历',{wood:4,fiber:2},'observation_calendar_unlocked',[7,11]);
add('temperature','装配温度计',{wood:4,metal:4,parts:2},'observation_temperature_unlocked',[7,11]);
projects.calendar.toolbench=true;projects.temperature.toolbench=true;
add('agriculture','恢复农业设施',{stone:6,wood:4},'facility_restored:agriculture',[10,15],'facility_cleaned:agriculture');
add('livestock','恢复牧场装置',{metal:8,wood:8,parts:4},'facility_restored:livestock',[9,15],'facility_cleaned:livestock');
g.FacilityUnlockConfig={projects:projects,materials:materials,makeGroups:makeGroups};
})(window);
