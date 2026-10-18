/* Standalone campaign shell. Runtime values remain separate from combat/material systems. */
(() => {
'use strict';
const core=createForgeCore(),catalog=FORGE_CATALOG,levels=catalog.levels;
const $=id=>document.getElementById(id),KEY='forge-puzzle-campaign-v1';
const categories={B:'剑刃',T:'前端',D:'钝击侧',H:'完整手柄',M:'跨位置部件'};
const chapterNumerals=['一','二','三','四','五','六'];
const geometries=levels.map(l=>core.geometry(l.mask));
let progress={version:1,completed:[],active:{level:0,variant:0,ops:[],finished:false,assisted:false}};
let chapter=1,board=[],left={},g,level,caseData,previewIndex=-1,toastTimer,storageOK=true;
function notify(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3800);}
function validSave(raw){
 if(!raw||raw.version!==1||!Array.isArray(raw.completed)||raw.completed.length>83)throw Error('存档格式不匹配');
 const completed=[];
 for(let i=0;i<raw.completed.length;i++){if(raw.completed[i]!==levels[i].id)throw Error('关卡进度不连续');completed.push(raw.completed[i]);}
 const a=raw.active;if(!a||!Number.isInteger(a.level)||a.level<0||a.level>=83||a.level>completed.length)throw Error('当前关卡尚未解锁');
 const l=levels[a.level];if(!Number.isInteger(a.variant)||a.variant<0||a.variant>=l.cases.length||!Array.isArray(a.ops)||a.ops.length>20)throw Error('盘面记录无效');
 if(a.ops.some(o=>o!=='Q'&&o!=='T'&&(!Number.isInteger(o)||o<0||o>=l.target.length)))throw Error('操作记录无效');
 const final=core.replay(l.cases[a.variant].values,a.ops,geometries[a.level],l.budget);if(!final)throw Error('操作记录超出次数或包含无效落锤');
 return {version:1,completed,active:{level:a.level,variant:a.variant,ops:a.ops.slice(),finished:a.finished===true,assisted:a.assisted===true}};
}
function store(){try{localStorage.setItem(KEY,JSON.stringify(progress));storageOK=true;}catch(e){storageOK=false;}
 $('storage-status').textContent=storageOK?'进度自动保存在当前浏览器':'浏览器未能保存进度，请在「存档」中导出';$('storage-status').classList.toggle('storage-warning',!storageOK);
}
try{const saved=localStorage.getItem(KEY);if(saved)progress=validSave(JSON.parse(saved));}catch(e){storageOK=false;}
chapter=levels[progress.active.level].tier;
function derive(){const a=progress.active;level=levels[a.level];g=geometries[a.level];caseData=level.cases[a.variant];board=core.replay(caseData.values,a.ops,g,level.budget);const spent=core.cost(a.ops);left={h:level.budget.h-spent.h,q:level.budget.q-spent.q,t:level.budget.t-spent.t};}
const matchCount=()=>board.filter((v,i)=>v===level.target[i]).length;
const isWin=()=>core.equal(board,level.target);
const label=o=>o==='Q'?'淬火':o==='T'?'回火':g.cells[o].label;
function chooseLevel(index){if(index>progress.completed.length||index<0||index>=83||index===progress.active.level)return;
 progress.active={level:index,variant:index===0?0:Math.floor(Math.random()*levels[index].cases.length),ops:[],finished:false,assisted:false};chapter=levels[index].tier;$('reference').hidden=true;render();store();
 if(window.innerWidth<761)$('game').scrollIntoView({block:'start',behavior:'auto'});
}
function renderCampaign(){
 $('chapters').replaceChildren();
 for(let t=1;t<=6;t++){
  const within=levels.filter(l=>l.tier===t),done=within.filter(l=>progress.completed.includes(l.id)).length;
  const btn=document.createElement('button');btn.className='chapter'+(chapter===t?' active':'');btn.setAttribute('aria-label','第'+chapterNumerals[t-1]+'章 '+catalog.chapters[t-1]+'，完成'+done+'关');btn.setAttribute('aria-current',chapter===t?'true':'false');
  for(const [cls,text]of [['chapter-number',String(t).padStart(2,'0')],['chapter-name',catalog.chapters[t-1]],['chapter-total',done+'/'+within.length]]){const s=document.createElement('span');s.className=cls;s.textContent=text;btn.append(s);}
  btn.addEventListener('click',()=>{chapter=t;renderCampaign();});$('chapters').append(btn);
 }
 const chapterLevels=levels.filter(l=>l.tier===chapter);$('chapter-name').textContent=catalog.chapters[chapter-1];$('chapter-count').textContent=chapterLevels.length+' 件部件';$('level-list').replaceChildren();
 for(const l of chapterLevels){const index=l.number-1,done=progress.completed.includes(l.id),locked=index>progress.completed.length;
  const b=document.createElement('button');b.className='level-tile'+(index===progress.active.level?' active':'')+(done?' done':'');b.disabled=locked;b.dataset.level=String(index);b.title=l.number+'. '+l.name+(locked?' · 通关前一关解锁':'');b.setAttribute('aria-label',b.title+(done?' · 已完成':''));b.textContent=String(l.number).padStart(2,'0');
  const mark=document.createElement('small');mark.textContent=done?'✓':locked?'·':'';b.append(mark);b.addEventListener('click',()=>chooseLevel(index));$('level-list').append(b);
 }
 $('total-progress').textContent=progress.completed.length+' / 83 件完成';$('total-bar').style.width=(progress.completed.length/83*100)+'%';
}
let currentCells=[],targetCells=[];
function buildBoards(){
 currentCells=[];targetCells=[];
 for(const [id,interactive]of [['current-board',true],['target-board',false]]){
  const parent=$(id);parent.replaceChildren();parent.style.setProperty('--cols',g.cols);parent.style.maxWidth=(20+g.cols*46)+'px';
  const corner=document.createElement('span');parent.append(corner);
  for(let c=0;c<g.cols;c++){const h=document.createElement('span');h.className='coordinate';h.textContent=String.fromCharCode(65+c);parent.append(h);}
  for(let r=0;r<g.rows;r++){
   const row=document.createElement('span');row.className='coordinate';row.textContent=r+1;parent.append(row);
   for(let c=0;c<g.cols;c++){
    const index=g.index.get(r+','+c);
    if(index===undefined){const e=document.createElement('span');e.className='void';e.setAttribute('aria-hidden','true');parent.append(e);continue;}
    const tile=document.createElement(interactive?'button':'span');tile.className=interactive?'cell':'target-cell';tile.dataset.cell=String(index);
    if(interactive){tile.type='button';tile.addEventListener('click',()=>perform(index));tile.addEventListener('mouseenter',()=>preview(index));tile.addEventListener('mouseleave',clearPreview);tile.addEventListener('focus',()=>preview(index));tile.addEventListener('blur',clearPreview);currentCells[index]=tile;}
    else targetCells[index]=tile;parent.append(tile);
   }
  }
 }
}
function clearPreview(){previewIndex=-1;for(const e of currentCells){e.classList.remove('preview');e.querySelector('.delta')?.remove();}}
function preview(i){clearPreview();if(progress.active.finished||left.h===0||board[i]===0)return;previewIndex=i;
 const impacted=[i,...g.neighbors[i]];for(const j of impacted){const e=currentCells[j];e.classList.add('preview');const tag=document.createElement('small');tag.className='delta';tag.textContent=j===i?'→0':'+'+board[i];e.append(tag);}
 $('move-detail').textContent=g.cells[i].label+' 归零；'+g.neighbors[i].map(j=>g.cells[j].label).join('、')+' 各增加 '+board[i]+'。';
}
function renderBoard(){
 const a=progress.active,win=isWin();
 for(let i=0;i<board.length;i++){
  const matched=board[i]===level.target[i],cell=currentCells[i],target=targetCells[i];
  cell.textContent=board[i];cell.disabled=a.finished||left.h===0||board[i]===0;cell.classList.toggle('matched',matched);
  cell.setAttribute('aria-label',g.cells[i].label+' 当前'+board[i]+'，目标'+level.target[i]+(matched?'，已达标':''));cell.title=g.cells[i].label+' · 目标 '+level.target[i];
  target.textContent=level.target[i];target.classList.toggle('matched',matched);target.setAttribute('aria-label',g.cells[i].label+'目标'+level.target[i]);
 }
 $('match-status').textContent=(win?'✓ 全部达标':matchCount()+' / '+board.length+' 格达标');$('match-status').classList.toggle('ready',win);
 $('hammer-count').textContent=left.h+' / '+level.budget.h;$('quench-count').textContent=left.q+' / '+level.budget.q;$('temper-count').textContent=left.t+' / '+level.budget.t;
 $('quench').disabled=a.finished||left.q===0;$('temper').disabled=a.finished||left.t===0;$('finish').disabled=a.finished;$('finish').classList.toggle('ready',win);
 $('undo').disabled=a.finished||a.ops.length===0;
 $('case-label').textContent='坯料 '+String(a.variant+1).padStart(2,'0')+' / 03 · '+board.length+' 格';
 $('history').replaceChildren();for(const op of a.ops){const item=document.createElement('span');item.textContent=label(op);$('history').append(item);}
 $('reference-path').textContent=caseData.solution.map(label).join(' → ');
 const prefix=a.ops.every((op,i)=>op===caseData.solution[i]);$('demo-step').disabled=a.finished||!prefix||a.ops.length>=caseData.solution.length;
 $('reference-status').textContent=prefix?'这是一条可达路径，可以逐步观察。':'当前操作与参考路径不同；重新开炉后可逐步演示。';
 $('move-detail').textContent=a.finished?(win?'成品已收入工坊图册。':'本炉已结束，重新开炉可再尝试。'):win?'每一格都已吻合，收工即可完成本关。':a.ops.length?'刚刚完成：'+label(a.ops[a.ops.length-1])+'。':'点击坯料上的格子，开始第一锤。';
 renderResult();
}
function renderResult(){
 const a=progress.active,win=isWin();$('result').hidden=!a.finished;$('result').classList.toggle('failed',!win);
 if(!a.finished)return;
 $('result-kicker').textContent=win?'锻造完成':'本炉结束';$('result-title').textContent=win?(a.level===82?'工坊图册已集齐':'又一件，恰到好处。'):'还差 '+(board.length-matchCount())+' 格';
 $('result-detail').textContent=win?(a.level===82?'83件部件全部完成，你可以回到任意关卡再试不同坯料。':'「'+level.name+'」已完成，下一件部件可以开始了。'):'次数与热处理由你分配，再试一次不同的操作顺序。';
 $('next-level').textContent=win?(a.level===82?'再锻一次':'下一关 →'):'重新开炉';
}
function render(){derive();renderCampaign();$('level-kicker').textContent='第'+chapterNumerals[level.tier-1]+'章 · '+catalog.chapters[level.tier-1]+' / 第'+level.number+'关';$('level-name').textContent=level.name;$('level-lesson').textContent=level.lesson;$('category').textContent=level.id+' · '+categories[level.category];$('reference-toggle').textContent=$('reference').hidden?'查看参考解':'收起参考解';buildBoards();renderBoard();}
function perform(op){
 const a=progress.active,key=op==='Q'?'q':op==='T'?'t':'h';if(a.finished||left[key]===0)return;
 const next=core.apply(board,op,g);if(!next)return;clearPreview();a.ops.push(op);derive();renderBoard();store();
 if(typeof op==='number'){currentCells[op].classList.remove('struck');void currentCells[op].offsetWidth;currentCells[op].classList.add('struck');}
}
function restart(change=false){
 const a=progress.active;let variant=a.variant;if(change){const choices=level.cases.map((_,i)=>i).filter(i=>i!==variant);variant=choices[Math.floor(Math.random()*choices.length)];}
 progress.active={level:a.level,variant,ops:[],finished:false,assisted:false};render();store();if(change)notify('坯料已更换，目标和操作次数不变。');
}
$('quench').addEventListener('click',()=>perform('Q'));$('temper').addEventListener('click',()=>perform('T'));
$('finish').addEventListener('click',()=>{if(progress.active.finished)return;progress.active.finished=true;if(isWin()&&progress.active.level===progress.completed.length)progress.completed.push(level.id);renderCampaign();renderBoard();store();$('result').scrollIntoView({block:'nearest',behavior:'auto'});});
$('undo').addEventListener('click',()=>{if(progress.active.finished||!progress.active.ops.length)return;progress.active.ops.pop();clearPreview();derive();renderBoard();store();});
$('restart').addEventListener('click',()=>restart());$('new-case').addEventListener('click',()=>restart(true));
$('next-level').addEventListener('click',()=>{if(isWin()&&progress.active.level<82)chooseLevel(progress.active.level+1);else restart();});
$('reference-toggle').addEventListener('click',()=>{$('reference').hidden=!$('reference').hidden;$('reference-toggle').textContent=$('reference').hidden?'查看参考解':'收起参考解';});
document.addEventListener('keydown',event=>{
 if(event.code!=='KeyH'||!event.ctrlKey||!event.shiftKey||event.altKey||event.metaKey||event.repeat||event.isComposing)return;
 if(document.querySelector('dialog[open]')||event.target.isContentEditable||event.target.closest?.('input,textarea,select'))return;
 event.preventDefault();
 const toggle=$('reference-toggle');toggle.hidden=!toggle.hidden;
 if(toggle.hidden){$('reference').hidden=true;toggle.textContent='查看参考解';}
});
$('demo-step').addEventListener('click',()=>{if($('demo-step').disabled)return;progress.active.assisted=true;perform(caseData.solution[progress.active.ops.length]);});
$('help-open').addEventListener('click',()=>$('help-dialog').showModal());
$('save-open').addEventListener('click',()=>{$('save-summary').textContent='已完成 '+progress.completed.length+' / 83 件，当前在第 '+level.number+' 关。';$('save-dialog').showModal();});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
function download(text,name){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('export-save').addEventListener('click',()=>{$('save-text').value=JSON.stringify(progress,null,2);$('save-text-section').open=true;$('save-text').focus();$('save-text').select();});
$('download-save').addEventListener('click',()=>download(JSON.stringify(progress,null,2),'百炼工坊-存档.json'));
$('copy-save').addEventListener('click',async()=>{if(!$('save-text').value)$('save-text').value=JSON.stringify(progress,null,2);try{await navigator.clipboard.writeText($('save-text').value);notify('存档文本已复制。');}catch(e){$('save-text').focus();$('save-text').select();notify('存档文本已选中，请使用复制命令保存。');}});
function loadText(text){const incoming=validSave(JSON.parse(text));progress=incoming;chapter=levels[progress.active.level].tier;$('save-dialog').close();$('reference').hidden=true;render();store();notify('存档已载入。');}
$('load-save-text').addEventListener('click',()=>{try{if($('save-text').value.length>100000)throw Error('存档文本过长');loadText($('save-text').value);}catch(e){notify('无法导入：'+e.message);}});
$('import-save').addEventListener('click',()=>$('save-file').click());
$('save-file').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>100000)throw Error('存档文件过大');loadText(await file.text());}catch(e){notify('无法导入：'+e.message);}finally{event.target.value='';}});
$('reset-save').addEventListener('click',()=>{if(!window.confirm('清除全部关卡进度？建议先导出存档。'))return;progress={version:1,completed:[],active:{level:0,variant:0,ops:[],finished:false,assisted:false}};chapter=1;$('save-dialog').close();$('reference').hidden=true;render();store();notify('已回到第一关。');});
render();store();
})();
