import {readFile,writeFile} from 'node:fs/promises';
import {createBladeForge} from './blade-forging/core.mjs';
const source=new URL('./blade-forging/',import.meta.url);
const [html,css,js,fx,catalog,symbols,symbolCSS]=await Promise.all(['game.html','game.css','game.js','effects.js','levels.json','symbols.js','symbols.css'].map(name=>readFile(new URL(name,source),'utf8')));
const data=JSON.parse(catalog);
if(data.levels.length!==83)throw Error('Incomplete component catalog');
const output=html.replace('/* INLINE_STYLE */',()=>css+'\n'+symbolCSS).replace('/* INLINE_SCRIPT */',()=>createBladeForge.toString()+'\nconst FORGE_CATALOG='+JSON.stringify(data).replace(/</g,'\\u003c')+';\n'+symbols+'\n'+fx+'\n'+js);
for(const name of ['blade-forging-playtest.html','百炼工坊-83部件-独立试玩.html']){
 await writeFile(new URL('./'+name,import.meta.url),output,'utf8');
 console.log('Built tools/'+name+' ('+Buffer.byteLength(output)+' bytes), standalone and offline.');
}
