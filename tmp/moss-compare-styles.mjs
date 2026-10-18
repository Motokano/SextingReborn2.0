import fs from 'node:fs';
const a=JSON.parse(fs.readFileSync('tmp/moss-game-computed.json')),b=JSON.parse(fs.readFileSync('tmp/moss-demo-computed.json'));
const differences=[];for(const key of Object.keys(a))for(const prop of Object.keys(a[key]))if(a[key][prop]!==b[key][prop])differences.push([key,prop,a[key][prop],b[key][prop]]);
console.log(JSON.stringify({checked:Object.keys(a).length*Object.keys(a.case).length,differences},null,2));
