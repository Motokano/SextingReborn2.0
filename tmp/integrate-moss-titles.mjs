import fs from 'node:fs';
let s=fs.readFileSync('js/scene-app.js','utf8');s=s.replaceAll("dragHandle: '.block-title, h1, summary, .buff-hud-title'", "dragHandle: '.panel-head, .block-title, h1, summary, .buff-hud-title'");fs.writeFileSync('js/scene-app.js',s);
// Keep the title keys in the central dictionary, where SceneApp's menu expects them.
const p='data/ui_text_zhCN.json';const data=JSON.parse(fs.readFileSync(p,'utf8'));data['ui.windows.carry']='携行';data['ui.windows.attrs']='成长';data['ui.windows.limbs']='身体';data['ui.windows.time']='环境 · 顶部栏';data['ui.windows.log']='事件记录';fs.writeFileSync(p,JSON.stringify(data,null,2)+'\n');
