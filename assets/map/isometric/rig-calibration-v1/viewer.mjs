import {renderPawnSvg} from './renderer.mjs';
const [rig,library]=await Promise.all(['skeleton.json','poses.json'].map(p=>fetch(p).then(r=>r.json())));
const names={head:'头',chest:'胸',abdomen:'腹',lhand:'左臂',rhand:'右臂',lfoot:'左腿',rfoot:'右腿'};
const $=s=>document.querySelector(s);
const svg=(state,skin,wire,uid)=>renderPawnSvg(rig,state,skin,wire,uid);
$('#state').innerHTML=library.states.map(s=>'<option value="'+s.destroyMask+'">'+s.id+' · '+s.pose+' · '+(s.injuryLayers.map(l=>names[l.part]).join('＋')||'头胸腹正常')+'</option>').join('');
function show(){
 const state=library.states[+$('#state').value],wire=$('#wire').checked;
 $('#large').innerHTML=svg(state,0,wire,'large');
 $('#other').innerHTML=svg(state,1,wire,'other');
 $('#actual').innerHTML=svg(state,0,false,'actual');
 $('#info').textContent=state.id+' · '+state.pose+' · '+(state.adjustment?'侧卧接触优先，伤效保留':'已保存最终关节变换');
 $('#joints').innerHTML=state.nodes.filter(n=>n.visible).map(n=>'<tr><td>'+n.id+'</td><td>'+n.length+'</td><td>'+n.localEulerXYZDeg.map(x=>x.toFixed(3)+'°').join(' / ')+'</td></tr>').join('');
 $('#contacts').textContent=state.contacts.map(c=>names[c.part]+'：'+(c.type==='active'?'主动支撑':'被动接触')+' ['+c.target.map(x=>x.toFixed(2)).join(', ')+']').join('；');
}
$('#state').onchange=show;$('#wire').onchange=show;
$('#next').onclick=()=>{$('#state').value=(+$('#state').value+1)%128;show()};
$('#previous').onclick=()=>{$('#state').value=(+$('#state').value+127)%128;show()};
$('#all').innerHTML=library.states.map(s=>'<button class="thumb" data-state="'+s.destroyMask+'">'+svg(s,0,false,'thumb'+s.id)+'<span>'+s.id+' · '+s.pose+'</span></button>').join('');
$('#all').onclick=e=>{const b=e.target.closest('[data-state]');if(b){$('#state').value=b.dataset.state;show();window.scrollTo({top:0,behavior:'smooth'})}};
const initial=Number(new URLSearchParams(location.search).get('state')||0);
if(Number.isInteger(initial)&&initial>=0&&initial<128)$('#state').value=initial;
show();
