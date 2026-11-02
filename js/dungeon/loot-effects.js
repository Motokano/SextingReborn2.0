(() => {
  'use strict';
  // 搜索与回收各自管理播放状态，共用稀有度和视觉规则。
  window.createLootRevealEffects=()=>{
    const rarities=new Set(['common','uncommon','rare','exceptional','legendary']),timers=new Map(),bursts=new Map();
    const rarity=key=>{const value=window.RuinsContainerSearch.items[key]?.rarity;return rarities.has(value)?value:'common';};
    function clear(row){
      clearTimeout(timers.get(row));timers.delete(row);
      const burst=bursts.get(row);if(burst){cancelAnimationFrame(burst.frame);burst.node.remove();bursts.delete(row);}
      window.LOOT_REVEAL_AUDIO?.cancel(row);
      row.classList.remove('loot-discovered');row.querySelector('.loot-flare')?.remove();
    }
    function clearAll(){for(const row of timers.keys())clear(row);}
    function projectBurst(row,rank,duration){
      if(rank==='common'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      const panel=row.closest('.loot-window,.recovery-window,.du-modal');if(!panel)return;
      const node=document.createElement('div'),red=rank==='legendary',gold=rank==='exceptional',rare=rank==='rare';
      node.className='loot-burst';node.dataset.rarity=rank;node.setAttribute('aria-hidden','true');
      node.style.setProperty('--loot-glow',getComputedStyle(row).getPropertyValue('--loot-glow'));
      node.style.setProperty('--burst-duration',duration+'ms');
      const particleCount=red?40:gold?28:rare?18:8,streakCount=red?14:gold?10:rare?6:0;
      node.innerHTML='<div class="burst-origin"><i class="burst-aura"></i><i class="burst-corona"></i><i class="burst-beam"></i><i class="burst-beam thin"></i><i class="burst-shockwave"></i><i class="burst-shockwave second"></i><i class="burst-shockwave third"></i><i class="burst-star"></i>'+(red?'<i class="burst-sigil"></i><i class="burst-sigil inner"></i><i class="burst-crown"></i>':'')+Array.from({length:particleCount},(_,i)=>{
        const angle=i/particleCount*Math.PI*2,reach=(red?135:gold?100:rare?75:38)+(i%4)*22;
        return '<i class="burst-particle" style="--px:'+Math.round(Math.cos(angle)*reach)+'px;--py:'+Math.round(Math.sin(angle)*reach*.8-(red?65:25))+'px;--delay:'+(90+i%5*85)+'ms;--turn:'+i*37+'deg;--size:'+(red?5+i%4:gold?4+i%4:3+i%3)+'px"></i>';
      }).join('')+Array.from({length:streakCount},(_,i)=>'<i class="burst-streak" style="--angle:'+(i/streakCount*360)+'deg;--delay:'+(i%3*95)+'ms"></i>').join('')+'</div>';
      document.body.append(node);const entry={node,frame:0};bursts.set(row,entry);
      function follow(){
        if(!row.isConnected||panel.hidden){clear(row);return;}
        const r=row.getBoundingClientRect(),p=panel.getBoundingClientRect(),list=row.closest('.loot-list,.allocation-list'),v=list?.getBoundingClientRect()||p;
        const art=row.querySelector('.item-art'),icon=art?.getBoundingClientRect();
        const x=icon?.width?icon.x+icon.width/2:r.left+14,y=icon?.height?icon.y+icon.height/2:r.top+r.height/2;
        // Hidden/scrolled-away rows do not radiate through another panel.
        node.style.visibility=y<v.top||y>v.bottom||y<p.top||y>p.bottom?'hidden':'visible';
        node.style.setProperty('--origin-x',x+'px');node.style.setProperty('--origin-y',y+'px');
        // Escape the scrolling list, but keep text/buttons free of projected light.
        let clip=`M 0 0 H ${innerWidth} V ${innerHeight} H 0 Z`;
        for(const element of panel.querySelectorAll('.item-name,.item-quantity,.allocation-item-name,.take-button,.claimed-label,.window-head,.recovery-head,.window-footer,.recovery-footer,.allocation-heading,.du-item>span,.du-item>small,.du-item>button,.du-head,.du-section')){
          const b=element.getBoundingClientRect();if(!b.width||!b.height)continue;
          // Paths wind in the opposite direction to cut transparent holes.
          clip+=` M ${b.left-1} ${b.top-1} V ${b.bottom+1} H ${b.right+1} V ${b.top-1} Z`;
        }
        node.style.clipPath=`path('${clip}')`;entry.frame=requestAnimationFrame(follow);
      }
      follow();
    }
    function play(row){
      if(!row?.isConnected)return 0;
      clear(row);
      const flare=document.createElement('span');flare.className='loot-flare';flare.setAttribute('aria-hidden','true');
      const rank=row.dataset.rarity||'common',red=rank==='legendary',gold=rank==='exceptional',rare=rank==='rare';
      const count=red?24:gold?18:rare?10:rank==='uncommon'?6:0;
      flare.innerHTML='<i class="reveal-bloom"></i><i class="reveal-rays"></i><i class="reveal-core"></i><i class="reveal-ring"></i><i class="reveal-ring echo"></i><i class="reveal-ring final"></i><i class="reveal-orbit"></i><i class="reveal-lens"></i><i class="reveal-sweep"></i><i class="reveal-trace"></i><i class="reveal-trace lower"></i>'+Array.from({length:count},(_,i)=>{
        const angle=(i/count)*Math.PI*2,reach=(red?46:gold?32:22)+(i%4)*12;
        return '<i class="reveal-spark" style="--dx:'+Math.round(Math.cos(angle)*reach)+'px;--dy:'+Math.round(Math.sin(angle)*reach)+'px;--lag:'+(90+(i%4)*65)+'ms;--spin:'+(i*37)+'deg"></i>';
      }).join('')+Array.from({length:red?18:gold?12:rare?8:rank==='uncommon'?4:0},(_,i)=>
        '<i class="reveal-mote" style="--mx:'+(14+(i*19)%77)+'%;--my:'+(15+(i*29)%65)+'%;--lag:'+(180+(i%5)*130)+'ms;--lift:'+(-12-(i%3)*8)+'px;--spin:'+(i*31)+'deg"></i>'
      ).join('');
      row.appendChild(flare);row.classList.add('loot-discovered');
      const duration=parseFloat(getComputedStyle(row).getPropertyValue('--reveal-duration'))||700;
      projectBurst(row,rank,duration);
      const audioDuration=window.LOOT_REVEAL_AUDIO?.request(rank,row)||0;
      timers.set(row,setTimeout(()=>clear(row),duration+100));
      return Math.max(matchMedia('(prefers-reduced-motion: reduce)').matches?0:duration,audioDuration);
    }
    return {rarity,play,clear,clearAll};
  };
})();
