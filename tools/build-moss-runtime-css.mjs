import fs from 'node:fs';
const source=fs.readFileSync('css/ui-moss-prototype.css','utf8');
// Keep declarations byte-for-byte; only scope selector names to the runtime HUD.
function scopeSelector(selector){
 let s=selector.trim().replace(/\.panel(?![\w-])/g,'.moss-panel');
 if(s.startsWith(':root'))return s.replace(':root','body.moss-game');
 if(s.startsWith('body'))return s.replace(/^body/,'body.moss-game');
 return 'body.moss-game '+s;
}
let css=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/([^{}]+)\{/g,(whole,pre)=>{
 const s=pre.trim();if(s.startsWith('@'))return whole;
 return pre.slice(0,pre.indexOf(s))+s.split(/,(?![^()]*\))/).map(scopeSelector).join(',')+'{';
});
// Generic page/control resets belong to this HUD only.
css=css.replace(/body\.moss-game \*/g,'body.moss-game .moss-runtime *').replace(/body\.moss-game (button|select|input)(?=[\s,{:.[])/g,'body.moss-game .moss-runtime $1');
css=css.replaceAll('body.moss-game','body#moss-hud-theme.moss-game');
fs.writeFileSync('css/ui-moss-runtime.css','/* Generated from the approved demo. Run node tools/build-moss-runtime-css.mjs after changing its styles. */\n'+css);
