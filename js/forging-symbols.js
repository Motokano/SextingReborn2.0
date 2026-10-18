// Presentation-only symbols shared by the workshop and the standalone campaign.
function forgeEffectSymbol(type){
 const paths={
  keep:'<path d="M12 2 21 6v6c0 5-9 10-9 10S3 17 3 12V6Z" fill="currentColor" fill-opacity=".15"/><path d="m7.5 12 3 3 6-7"/>',
  burst:'<path d="m14 2-10 12h7l-1 8L21 9h-8Z" fill="currentColor" fill-opacity=".75"/>',
  gather:'<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 1v6m-3-3 3 3 3-3M12 23v-6m-3 3 3-3 3 3M1 12h6m-3-3 3 3-3 3m19-3h-6m3-3-3 3 3 3"/>',
  warmth:'<path d="M13 2c1 6-5 7-2 11 2-1 4-3 4-5 4 4 6 6 5 9-1 7-15 7-16 0-1-4 3-7 4-10 0 4 2 5 2 5-1-5 3-6 3-10Z" fill="currentColor" fill-opacity=".25"/><path d="M12 15c-4 4-1 6 1 5 2-1 1-3-1-5Z" fill="currentColor"/>',
  flake:'<path d="m10 3-7 7 4 3 4-4-1-6Zm5 4-3 5 3 3 6-4-6-4ZM8 16l-2 4 7 1 1-4-6-1Z" fill="currentColor" fill-opacity=".25"/><path d="m2 3 2 1m17 15 1 2M17 1l1 2"/>',
  spread:'<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 8V2m-2 2 2-2 2 2M12 16v6m-2-2 2 2 2-2M8 12H2m2-2-2 2 2 2m12-2h6m-2-2 2 2-2 2M8 8 3 3m0 3V3h3m10 5 5-5m-3 0h3v3M8 16l-5 5m0-3v3h3m10-5 5 5m-3 0h3v-3"/>',
  erase:'<path d="m16 2 5 5-11 11H5v-5L16 2Z" fill="currentColor" fill-opacity=".2"/><path d="m12 6 5 5M3 22h18M5 13l5 5"/>',
  level:'<path d="M3 13h18M3 17h18M3 21h18M12 2v7m-4-4 4 4 4-4"/>',
  rebound:'<path d="M3 3h12v6H3zM7 9v11h4V9" fill="currentColor" fill-opacity=".2"/><path d="M18 12v10m-5-5h10"/>'
 };
 return paths[type]?'<svg class="effect-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+paths[type]+'</svg>':'';
}
function paintForgeSymbol(tile,type,kind){
 const symbol=tile.querySelector('.sigil');
 if(type){
  if(tile.dataset.sigil!==type)symbol.innerHTML=forgeEffectSymbol(type);
  tile.dataset.sigil=type;tile.dataset.sigilKind=kind;
 }else{
  if(tile.dataset.sigil)symbol.replaceChildren();
  delete tile.dataset.sigil;delete tile.dataset.sigilKind;
 }
}
