// Single variant requested: extend the approved stepped repair UI with labor.
// Throwaway, memory-only prototype; never load NPCSystem or SaveSystem here.
const projects={
 agriculture:{title:'恢复农业设施',tab:'农业设施',ticks:1000,cost:{stone:6,wood:4},pos:[10,15],texts:['水源口积着淤泥，废弃杂物挡住了操作位置。田地还没有开垦。','入口处清出了一小片空地，堆积的杂物仍然很多。','搬运通道已经畅通，水源口的淤泥才刚开始清除。','水源口渐渐露出，导水边缘仍埋着碎石与沉积物。','大部分淤堵已经清除，只剩边角和操作位置需要整理。','水源口与操作位置已经清理干净。接下来需要修补导水边缘和支撑结构。'],finish:'基础取水与导水结构恢复可用。完整农业地图可以使用，开垦、布渠和设备布局由你安排。'},
 livestock:{title:'恢复牧场装置',tab:'牧场装置',ticks:1000,cost:{metal:8,wood:8,parts:4},pos:[9,15],texts:['轴心周围堆着杂物，机械臂的活动范围被堵住了。四区的牧草仍然保留着。','轴心旁清出了一处落脚点，杂物仍挡着机械臂。','轴心周围已经露出空地，开始清理机械臂下方。','几处活动间隙已经清通，仍有沉重的杂物需要搬开。','机械臂的活动范围基本清空，还需要收拾残留碎屑。','轴心和机械臂的活动范围已清理干净。接下来需要修补传动连接与基础支撑。'],finish:'轴心与基础支撑恢复可用。完整四区轮牧框架开放，动物和功能模块需要另行安排。'}
};
let flags={},selected='agriculture',stamina=30,elapsed=0,timer=null,visible=true,notice='',states={};
const app=document.getElementById('app');
window.NPCSystem={getFlagValue:k=>flags[k],isDemoFlagTrue:k=>flags[k]===true,setDemoFlag:(k,v)=>flags[k]=v,getDemoState:()=>structuredClone({flags}),setDemoState:s=>{flags=structuredClone(s.flags);}};
window.SaveSystem={saveNow:()=>true};
window.GameEngine={getState:()=>({mapId:'M0_Base_Inside_lv_1',x:projects[selected].pos[0],y:14}),getMap:()=>({map_id:'M0_Base_Inside_lv_1'})};
window.SceneRenderer={render:()=>draw()};
for(const [id,p] of Object.entries(projects))FacilityUnlockConfig.projects[id]={id,title:p.title,groups:FacilityUnlockConfig.makeGroups(p.cost),position:p.pos,requires:'labor_done:'+id,unlock:'prototype_ready:'+id};
const catalog=await(await fetch('../data/item-catalog-v2.json')).json();
InventoryEquipment.setConfig({equipment:{prototype_bag:{item_id:'prototype_bag',equip_slot:'backpack',backpack_slots:30}},items:ItemAttributeModules.hydrateCatalog(catalog),modules:{},default_equipment:{}});
function stop(){clearInterval(timer);timer=null;}
function reset(){stop();if(FacilityUnlockPanel.isOpen())FacilityUnlockPanel.close();flags={};stamina=30;elapsed=0;visible=true;notice='';states={agriculture:{done:0,log:[]},livestock:{done:0,log:[]}};InventoryEquipment.setState({equipment:{backpack:{item_id:'prototype_bag'}},inventory_backpack:FacilityUnlockConfig.materials.map(m=>({item_id:m[0],count:12})),inventory_pocket:[],inventory_vest:[],ground_items:{}});draw();}
function clock(){const m=9*60+elapsed*10;return '劳动第'+(Math.floor(m/1440)+1)+'日 '+String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
function log(text){states[selected].log.unshift(clock()+'　'+text);states[selected].log.length=Math.min(states[selected].log.length,3);}
function tick(render=true){const p=projects[selected],s=states[selected];if(stamina<3){stop();notice='体力不足，清理已停下。已做的工作会保留。';log('你停下来喘了口气。');if(render)draw();return;}stamina-=3;elapsed++;s.done++;if(s.done>=p.ticks){stop();flags['labor_done:'+selected]=true;notice='场地已清理好，可以准备修复材料。';log('清理完成。');}else if(stamina<3){stop();notice='剩余体力不足以继续，清理已停下。';log('暂时停工，已清理的部分保留。');}else{notice='正在清理，每个劳动 tick 消耗 3 点体力。';log('搬开杂物，继续清理。');}if(render)draw();}
function draw(){if(!states[selected])return;const p=projects[selected],s=states[selected],clean=s.done>=p.ticks,ready=flags['prototype_ready:'+selected];
 app.innerHTML='<nav class="facility-tabs" aria-label="选择设施">'+Object.entries(projects).map(([id,x])=>`<button data-project="${id}" aria-pressed="${id===selected}">${x.tab}</button>`).join('')+'</nav>'+
 (!visible?'<section class="sheet"><div class="body"><h1>清理已暂停</h1><p>已完成的清理保留，随时可以回来继续。</p><button data-action="open">返回设施</button></div></section>':
 `<section class="sheet"><header><div><h1>${p.title}</h1><span class="muted">清理遗留杂物，再修复基础结构</span></div><div class="vigor"><strong>当前体力　${stamina} / 30</strong><meter aria-label="当前体力" min="0" max="30" value="${stamina}"></meter><div class="time">${clock()}</div></div></header><div class="body"><nav class="phases" aria-label="恢复阶段"><span class="phase ${!clean?'current':''}">${clean?'✓ ':''}清理场地</span><span class="phase ${clean?'current':''}">${ready?'✓ ':''}修补基础</span></nav><div class="condition"><h2>${ready?'设施已恢复':clean?'可以着手修补了':s.done?'清理过一部分的场地':'荒废的场地'}</h2><p>${ready?p.finish:p.texts[clean?5:s.done===0?0:s.done<250?1:s.done<500?2:s.done<750?3:4]}</p></div><p class="status" role="status">${notice||(!clean?'清理只消耗时间与体力，不扣材料。':'修复沿用已知材料选取与整件退回规则。')}</p><div class="actions">${ready?'':clean?'<button class="primary" data-action="repair">准备修复材料</button>':`<button class="primary" data-action="${timer?'pause':'start'}" ${!timer&&stamina<3?'disabled':''}>${timer?'暂停清理':s.done?'继续清理':'开始清理'}</button><span class="muted">每 tick 消耗 3 体力 · 可中途停下</span>`}<button data-action="leave">${timer?'停下并离开':'离开'}</button></div><div class="journal" aria-label="劳动记录">${s.log.length?s.log.map(x=>'<p>'+x+'</p>').join(''):'<p>尚未开始清理。</p>'}</div></div></section>`);
}
app.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.project){stop();selected=b.dataset.project;visible=true;notice='';draw();return;}switch(b.dataset.action){case 'start':if(stamina<3||states[selected].done>=projects[selected].ticks)return;notice='开始清理。你可以随时暂停。';timer=setInterval(()=>tick(),1000);break;case 'pause':stop();notice='已暂停，清理进度保留。';log('停下休息。');break;case 'leave':stop();visible=false;break;case 'open':visible=true;notice='';break;case 'repair':FacilityUnlockPanel.open(selected,()=>{notice=flags['prototype_ready:'+selected]?'基础设施已恢复。':'已投入的修复材料会保留。';draw();});return;}draw();});
document.getElementById('low').onclick=()=>{stamina=4;notice='已模拟体力不足，可尝试开始清理。';draw();};
document.getElementById('rest').onclick=()=>{stop();stamina=30;notice='模拟休息完成。清理不会自动重启。';draw();};
document.getElementById('fast').onclick=()=>{
 stop();const p=projects[selected],s=states[selected];if(s.done>=p.ticks){notice='清理已经完成，不再消耗体力。';draw();return;}
 const count=Math.min(250,p.ticks-s.done);let rests=0;
 for(let i=0;i<count;i++){if(stamina<3){stamina=30;rests++;}tick(false);}
 notice=(s.done>=p.ticks?'清理已完成，可以准备材料。':'加速演示已停下，清理进度保留。')+'本次模拟补充体力 '+rests+' 次；休息时间未计入劳动时钟。';
 log('加速演示结束，每次劳动照常扣除体力。');draw();
};
document.getElementById('reset').onclick=reset;
document.addEventListener('visibilitychange',()=>{if(document.hidden&&timer){stop();notice='离开页面时已暂停清理。';draw();}});
reset();
