// The approved C layout, unchanged. This service touches outer hosts only.
export function createLayout(g, U, panels, ids, left, top, desktopBuffParent, desktopLogParent) {
const buff=panels.effects, log=panels.journal;
function arrange(){
 const w=g.innerWidth,h=g.innerHeight,header=top.getBoundingClientRect().height;
 if(w<760){if(buff.parentElement!==left)left.append(buff);if(log.parentElement!==left)left.append(log);}else{if(buff.parentElement!==desktopBuffParent)desktopBuffParent.append(buff);if(log.parentElement!==desktopLogParent)desktopLogParent.append(log);}
 const cw=Math.min(272,(w-64)/4),start=(w-(cw*4+36))/2;
 document.body.style.setProperty('--moss-header-height',header+'px');document.body.style.setProperty('--moss-quickbar-y',(h<880?header+22:310)+'px');
 ['body','survival','growth','carry'].forEach((id,i)=>{
  const el=panels[id];el.style.setProperty('--moss-default-x',start+i*(cw+12)+'px');el.style.setProperty('--moss-default-y',Math.max(header+20,h-280-18)+'px');el.style.setProperty('--moss-default-w',cw+'px');
 });
 let y=14;
 if(w<760){['body','survival','growth','carry','journal','effects','battle'].forEach(id=>{const el=panels[id];el.style.setProperty('--moss-default-x','14px');el.style.setProperty('--moss-default-y',y+'px');el.style.setProperty('--moss-default-w',left.clientWidth-28+'px');if(U.getVisible(ids[id]))y+=el.offsetHeight+14;});left.style.setProperty('--moss-scroll-height',y+'px');}
 else { [['journal',w-Math.min(300,w*.3)-18,header+18,Math.min(300,w*.3)],['effects',24,header+18,230],['battle',w/2-110,header+18,220]].forEach(([id,x,y,width])=>{const el=panels[id];el.style.setProperty('--moss-default-x',x+'px');el.style.setProperty('--moss-default-y',y+'px');el.style.setProperty('--moss-default-w',width+'px');});}
}
return arrange;
}
