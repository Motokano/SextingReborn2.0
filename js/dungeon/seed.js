/* New expeditions read the local computer clock once. Persist the result. */
(()=>{'use strict';
 let previous=null,sequence=0;
 function create(){
  const milliseconds=Date.now();
  sequence=milliseconds===previous?sequence+1:0;previous=milliseconds;
  return 'ruins-'+milliseconds+'-'+sequence;
 }
 globalThis.RuinsSeed={create};
})();
