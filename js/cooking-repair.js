/* Compatibility adapter for the original kitchen repair entry. */
(function(g){var r=g.FacilityUnlock.get('cooking'),reset=r.reset;r.reset=function(){reset();g.FacilityUnlockConfig.materials.filter(function(m){return m[1]==='wood'||m[1]==='stone';}).forEach(function(m){g.NPCSystem.setDemoFlag('repair_use_known:'+m[0],false);});};g.CookingRepair=r;})(window);
