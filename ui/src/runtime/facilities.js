import { mount, unmount, flushSync } from 'svelte';
import { writable } from 'svelte/store';
import FacilityLabor from '../features/FacilityLabor.svelte';
import FacilityRepair from '../features/FacilityRepair.svelte';
import Toolbench from '../features/Toolbench.svelte';
import HideoutWarehouse from '../features/HideoutWarehouse.svelte';
import { text } from '../bridge/hud';

export function mountFacilities(g, overlays) {
    const labor = writable({open:false}), materials = writable({open:false}), toolbench = writable({open:false}), warehouse = writable({open:false});
    const L=g.FacilityLaborPanel, R=g.FacilityUnlockPanel, T=g.ToolbenchPanel, W=g.HideoutWarehousePanel;
    const disposers=[L.attachView(labor.set),R.attachView(materials.set),T.attachView(toolbench.set),W.attachView(warehouse.set)];
    const old=g.document.getElementById('modal-hideout-warehouse'), parent=old.parentElement, anchor=old.nextSibling;
    old.remove();
    const components=[
        mount(HideoutWarehouse,{target:parent,anchor,props:{store:warehouse,materials,repair:R,controller:{...W,close:()=>g.SceneApp.closeHideoutWarehousePanel()},overlays,t:(key,vars)=>text(g,key,vars)}}),
        mount(FacilityLabor,{target:g.document.body,props:{store:labor,controller:L,overlays}}),
        mount(FacilityRepair,{target:g.document.body,props:{store:materials,controller:R,overlays}}),
        mount(Toolbench,{target:g.document.body,props:{store:toolbench,materials,controller:T,repair:R,overlays}})
    ];
    flushSync();
    g.SvelteFacilities={refresh:()=>{if(W.isOpen())W.render();if(T.isOpen())T.refresh();}};
    // The original business controllers own all work intervals; unmount only stops them.
    return ()=>{disposers.forEach(dispose=>dispose());components.forEach(c=>unmount(c));delete g.SvelteFacilities;};
}
