/* Shared interface icons: fixed view box, independent of font baselines. */
window.RuinsUIIcons=(()=>{
 'use strict';
 const paths={
  back:'<path d="M19 12H5m6-6-6 6 6 6"/>',
  chat:'<path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 8h8M8 12h5"/>',
  bag:'<path d="M8 6h8l3 14H5L8 6Zm1 0V4a3 3 0 0 1 6 0v2"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  flag:'<path d="M5 21V3h13l-3 5 3 5H5"/>',
  stamina:'<path d="m13 3-8 11h6l-1 7 9-11h-6Z"/>',
  spark:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
  exit:'<path d="M10 4H4v16h6M9 12h12m-4-4 4 4-4 4"/>',
  descend:'<path d="M3 5h6v5h6v5h6v5M16 3v7m-3-3 3 3 3-3"/>',
  leave:'<path d="M10 4H4v16h6M9 12h12m-4-4 4 4-4 4"/>',
  potential:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/><path d="m12 8 4 4-4 4-4-4Z"/>',
  map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16M15 5v16"/>',
  swords:'<path d="m4 3 5 2 10 12-2 2L5 9Zm16 0-5 2-4 5m-2 3-4 4 2 2 4-4M3 16l5 5m8-18 5 5M16 21l5-5M3 8l5-5"/>',
  point:'<path d="M5 10h14v10H5ZM4 10V5h16v5M9 5v5m6-5v5M10 14h4"/>',
  water:'<path d="M12 3c-2 4-7 8-7 12a7 7 0 0 0 14 0c0-4-5-8-7-12Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
  food:'<path d="M4 12h16a8 8 0 0 1-16 0ZM3 12h18M9 8c-2-2 2-3 0-5m6 5c-2-2 2-3 0-5"/>',
  fatigue:'<path d="M5 5v14M5 13h14v6M5 18h14M8 10h3v3M13 8h6v5"/>',
  medical:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  patrol:'<path d="M4 8h12l-3-3m3 3-3 3M20 16H8l3-3m-3 3 3 3"/>',
  grid:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  fit:'<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
 locate:'<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>',
  refresh:'<path d="M20 10a8 8 0 1 0-1.7 7M20 4v6h-6"/>',
  reset:'<path d="M4 10a8 8 0 1 1 1.7 7M4 4v6h6"/>',
  play:'<path d="m8 5 11 7-11 7Z"/>',
  pause:'<path d="M8 5v14M16 5v14"/>',
  arrow:'<path d="M6 18 18 6M6 6h12v12"/>',
  enter:'<path d="M19 5v9H5m5-5-5 5 5 5"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  partial:'<circle cx="12" cy="12" r="8"/><path d="M12 4v8h8"/>',
  energy:'<path d="m13 3-8 11h6l-1 7 9-11h-6Z"/>',
  woodDoor:'<path d="M5 21V3h14v18M9 3v18M15 3v18M2 21h20M12 12h1"/>',
  ironDoor:'<path d="M5 21V3h14v18M5 8h14M5 16h14M2 21h20M14 11v2"/>'
 };
 function svg(name){
  if(!paths[name])throw new Error('Unknown interface icon: '+name);
  return '<svg class="ui-icon" data-ui-icon="'+name+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+paths[name]+'</svg>';
 }
 function button(element,name,label){element.innerHTML=svg(name)+'<span>'+label+'</span>';}
 for(const placeholder of document.querySelectorAll('span[data-ui-icon]'))placeholder.outerHTML=svg(placeholder.dataset.uiIcon);
 return {svg,button};
})();
