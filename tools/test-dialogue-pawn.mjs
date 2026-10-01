import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const uiSource=fs.readFileSync('js/dialogue-ui.js','utf8');
const normalize=uiSource.match(/function normalizeEntityId\(role, speakerId\) \{[\s\S]*?\n    \}/)[0];
const normalization={};vm.createContext(normalization);vm.runInContext(normalize,normalization);
assert.equal(normalization.normalizeEntityId('player','npc.supervisor.manager'),'player');
const requests=[];
const ctx={Promise,Image:class {set src(value){requests.push(value);this.onload()}},
 document:{createElement:()=>({getContext:()=>({drawImage(...args){requests.push(args.slice(1,5))}}),toDataURL:()=> 'data:image/png;cropped'})},
 PlayerPawnRig:{getDialoguePortrait:()=>Promise.resolve('player-current-injury')},
 TileRendererV2:{getSpeakerPawn:id=>id==='npc.supervisor.manager'?{url:'manager-map.png',crop:[276,44,666,1208]}:{url:'generic-map.png'}}};ctx.window=ctx;vm.runInNewContext(fs.readFileSync('js/dialogue-pawn.js','utf8'),ctx);
assert.equal(await ctx.DialoguePawn.resolve('player','npc.supervisor.manager'),'player-current-injury');
assert.equal(await ctx.DialoguePawn.resolve('npc','npc.supervisor.manager'),'data:image/png;cropped');
assert.deepEqual(requests[1],[276,44,666,1208]);
assert.equal(await ctx.DialoguePawn.resolve('npc','npc.other'),'generic-map.png');
assert.equal(await ctx.DialoguePawn.resolve('narration','npc.supervisor.manager'),'');
assert.equal(await ctx.DialoguePawn.resolve('npc','unknown'),'');
const render=uiSource.slice(uiSource.indexOf('    function renderCurrent()'),uiSource.indexOf('    function next()',uiSource.indexOf('    function renderCurrent()')));
const elements={};const element=()=>({style:{},classList:{add(){},remove(){}},removeAttribute(){}});
let complete;
const line={speakerRole:'npc',speakerId:'npc.supervisor.manager',speakerName:'林经理',text:'existing line',avatarUrl:'old-headshot.png'};
const r={queue:[line],isOpen:true,currentSpeakerName:'',currentLineSpeakerRole:'',currentCloseLabel:'',currentAvatarUrl:'',currentFallbackGlyph:'',currentNextDisabled:false,currentNextLabel:'',lastLoggedKey:null,
 $:id=>elements[id] ||= element(),ui:x=>x,normalizeEntityId:normalization.normalizeEntityId,startTyping(){},logDialogueLine(){},clearOptionsUi(){},renderOptionsUi(){},renderDialogueText(){},options:null,
 DialoguePawn:{resolve:()=>new Promise(resolve=>{complete=resolve})}};r.global=r;for(const match of uiSource.matchAll(/var (\w+_ID) = '([^']+)'/g)) r[match[1]]=match[2];vm.createContext(r);vm.runInContext(render,r);
r.renderCurrent();assert.equal(r.currentAvatarUrl,'','old line portrait is ignored');r.queue=[{speakerRole:'player'}];complete('late-manager');await Promise.resolve();assert.equal(r.currentAvatarUrl,'','late previous-speaker image is ignored');
r.queue=[line];r.renderCurrent();complete('current-manager');await Promise.resolve();assert.equal(r.currentAvatarUrl,'current-manager');
console.log('PASS speaker identity, map crop reuse, player injury frame, narration/unknown, portrait override removal and async speaker race');
