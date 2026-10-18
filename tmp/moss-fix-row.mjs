import fs from 'node:fs';
let a=fs.readFileSync('js/ui-moss-game.js','utf8');
a=a.replace("const key=cell.id.slice(5).replace('belly','abdomen');const value", "const partId=cell.id.slice(5);const key=partId.replace('belly','abdomen');row.querySelector('.row>span').textContent={head:'头部',chest:'胸部',belly:'腹部',lhand:'左臂',rhand:'右臂',lfoot:'左腿',rfoot:'右腿'}[partId]||partId;const value");
a=a.replace("cell.innerHTML=known('body_detail')?'<b>'+number(value)+' <small>/ '+number(max)+'</small></b>':value>0?'受伤':'无碍';", "let reading=cell;if(cell.tagName!=='B'){reading=document.createElement('b');reading.id=cell.id;cell.replaceWith(reading);}reading.innerHTML=known('body_detail')?number(value)+' <small>/ '+number(max)+'</small>':value>0?'受伤':'无碍';");
a=a.replace("const tones={satiety:","const thirstLabel=$('status-metric-thirst').querySelector('.label');thirstLabel.removeAttribute('data-ui');thirstLabel.textContent='水分';\nconst tones={satiety:");
a=a.replace("const study=$('status-study').closest('.ruled-row');", "const expLabel=$('status-combat-experience').previousElementSibling;expLabel.removeAttribute('data-ui');expLabel.textContent='战斗经验';\nconst study=$('status-study').closest('.ruled-row');");
fs.writeFileSync('js/ui-moss-game.js',a);
