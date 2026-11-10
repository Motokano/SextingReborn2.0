// Small, matte ground paintings; these describe soil identity, not current irrigation.
const palettes = {
  soil_yellow_cotton: ['#84704b','#a58b5b','#5e5037','#c1a36c'],
  soil_cinnamon: ['#67533d','#867052','#443b2d','#a4926c'],
  soil_purple: ['#695362','#8c7181','#463b48','#b293a0'],
  soil_red: ['#80503e','#a26b4c','#54372e','#c48b62'],
  soil_saline_alkali: ['#8b8771','#b3ad91','#666653','#d9d1b2'],
  soil_alpine_meadow: ['#46594a','#718368','#303f36','#99a181'],
  soil_paddy: ['#56635b','#7b8878','#3c4943','#a9b3a0'],
  soil_black: ['#353c34','#52604a','#242b26','#7c8262'],
};
export const soilArtIds = Object.freeze(Object.keys(palettes));
const cache = new Map();
const path = (d,fill,opacity=1) => `<path d="${d}" fill="${fill}" opacity="${opacity}"/>`;
const line = (d,color,width=1,opacity=1) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" opacity="${opacity}" stroke-linecap="round" stroke-linejoin="round"/>`;
const dot = (x,y,r,color,opacity=1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
function random(seed){let value=seed;return()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296;};}

export function renderSoilArt(id,seed=0,tilled=false){
  if(!palettes[id])return '';
  const variant=((seed%5)+5)%5,key=`${id}:${variant}:${tilled}`;
  if(cache.has(key))return cache.get(key);
  const [base,light,dark,accent]=palettes[id],rand=random(71+variant*193);
  let art=`<rect width="100" height="100" fill="${base}"/>`;
  // Broad, irregular patches keep the tiny tile from becoming flat or noisy.
  art+=path('M0 0H100V19L76 15 53 24 25 16 0 25Z',light,.17);
  art+=path('M0 77 25 71 46 80 70 73 100 84V100H0Z',dark,.23);
  const clumps=id==='soil_black'?28:id==='soil_paddy'?10:18;
  for(let i=0;i<clumps;i++){
    const x=5+rand()*90,y=5+rand()*90,r=(id==='soil_yellow_cotton'?1.7:2.5)+rand()*4;
    art+=`<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${r.toFixed(1)}" ry="${(r*.57).toFixed(1)}" fill="${i%3===0?dark:light}" opacity="${i%3===0?.35:.27}"/>`;
    if(i%3===0)art+=line(`M${(x-r*.5).toFixed(1)} ${(y-1).toFixed(1)}l${r.toFixed(1)} -.7`,accent,1,.24);
  }
  if(id==='soil_yellow_cotton'){
    art+=path('M9 25 21 21 28 26 23 32 11 31ZM63 63 76 60 84 66 77 73 64 70Z',light,.38);
    for(let i=0;i<32;i++)art+=dot(4+rand()*92,4+rand()*92,.5+rand()*.7,accent,.35);
  }else if(id==='soil_cinnamon'){
    art+=path('M13 20 24 15 32 22 28 30 16 31ZM63 50 77 45 85 52 78 62 66 61ZM30 75 39 70 47 74 42 82 32 83Z',dark,.4);
    art+=line('M15 20 24 17 30 22M65 51l11-4 7 5M32 75l7-3 6 3',light,2,.65);
    art+=dot(68,23,1.7,accent,.7)+dot(20,63,1.2,accent,.7);
  }else if(id==='soil_purple'){
    art+=path('M12 25 30 17 25 26 15 31ZM64 43 83 38 77 45 65 49ZM29 75 46 67 41 76 30 80Z',dark,.55);
    art+=line('M14 24 28 19M66 42 81 39M31 74 44 69',accent,2,.58);
    art+=line('M43 36l11-5m-7 49 12-4m18-10 8-2',light,2,.6);
  }else if(id==='soil_red'){
    art+=path('M10 18 25 14 36 22 30 34 14 33ZM57 48 74 41 86 50 79 64 61 62ZM18 72 35 66 45 75 36 87 21 84Z',dark,.38);
    art+=line('M13 19 25 17 33 23M60 49 74 44 83 51M21 73 35 69 42 75',light,2.5,.72);
    art+=line('M42 10l-5 13 7 11m-7-11-8 1M88 67l-8 9 2 12m-2-12-10 1',dark,1.2,.5);
  }else if(id==='soil_saline_alkali'){
    art+=path('M4 15 16 10 26 15 23 20 11 23 3 20ZM61 35 80 30 94 35 90 43 77 47 63 42ZM18 74 29 66 44 68 48 77 36 86 22 83Z',accent,.48);
    art+=line('M0 47 18 42 31 48 43 40 61 45 73 57 100 51M18 42l-3-12m16 18 3 17m27-20 4-13m8 25-6 17',dark,1.3,.6);
    for(let i=0;i<18;i++)art+=dot(5+rand()*90,5+rand()*90,.7+rand()*.7,accent,.7);
  }else if(id==='soil_alpine_meadow'){
    art+=path('M0 5 20 3 27 9 18 18 5 23 0 21ZM79 78 96 70 100 73V100H69l3-12Z',light,.45);
    art+=line('M12 10l4 8 9-3m-9 3 2 8m-2-8-8 4M83 78l-4 11-7 5m7-5 9 3m-9-3-3-6',accent,1.1,.55);
    art+=line('M4 64l3-8 3 7m76-43 3-7 4 7M58 95l2-7 4 6',light,1.8,.8);
  }else if(id==='soil_paddy'){
    // Smooth clay streaks, deliberately no animated water or filled puddles.
    art+=path('M8 43 26 36 42 41 38 49 18 54ZM63 73 79 69 94 75 83 88 67 85Z','#615a45',.3);
    art+=path('M7 20Q28 10 45 20T92 18L86 28Q65 34 46 27T10 29Z',light,.22);
    art+=line('M8 24q17-8 34 0m13 35q19 6 35-1M13 78q20-5 39 1',accent,1.3,.38);
    art+=line('M18 38q21 8 43 2m-23 47q17 6 33-1',dark,2,.4);
  }else if(id==='soil_black'){
    art+=path('M12 24 19 20 24 24 22 29 16 30ZM64 61 73 56 80 60 77 66 68 69Z',dark,.65);
    art+=line('M23 62l8-5 4 2m18-32 5 6 7-1m-7 1-2 6M76 83l8-3',accent,1,.42);
    for(let i=0;i<20;i++)art+=dot(5+rand()*90,5+rand()*90,.8+rand(),dark,.6);
  }
  if(tilled){
    for(const y of [27,49,71]){
      art+=line(`M9 ${y+4}Q35 ${y-2} 51 ${y+1}T91 ${y-2}`,dark,3,.34);
      art+=line(`M10 ${y+2}Q35 ${y-4} 51 ${y-1}T90 ${y-4}`,light,1.3,.45);
    }
  }else{
    art+=path('M0 0H100V7L80 4 68 9 42 5 23 11 0 7ZM0 88 15 94 31 91 47 96 65 91 82 95 100 87V100H0Z','#60734a',.22);
  }
  const svg=`<svg class="au-soil-surface" data-soil-art="${id}" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${art}</svg>`;
  cache.set(key,svg);return svg;
}
