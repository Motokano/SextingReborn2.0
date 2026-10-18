import fs from 'node:fs';
const [url,expressionFile,screenshot]=process.argv.slice(2);
const tabs=await(await fetch('http://127.0.0.1:9337/json/list')).json();
let target=tabs.find(t=>t.type==='page'&&t.url===url);
if(!target){const v=await(await fetch('http://127.0.0.1:9337/json/version')).json();const b=new WebSocket(v.webSocketDebuggerUrl);await new Promise(r=>b.onopen=r);const ready=new Promise(r=>b.onmessage=e=>r(JSON.parse(e.data)));b.send(JSON.stringify({id:1,method:'Target.createTarget',params:{url}}));const result=await ready;b.close();target={webSocketDebuggerUrl:'ws://127.0.0.1:9337/devtools/page/'+result.result.targetId};}
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let i=0;const pending=new Map();const errors=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
function send(method,params={}){return new Promise(r=>{const id=++i;pending.set(id,r);ws.send(JSON.stringify({id,method,params}));});}
await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:Number(process.env.MOSS_WIDTH)||1440,height:Number(process.env.MOSS_HEIGHT)||1000,deviceScaleFactor:1,mobile:false});
if(process.env.MOSS_RELOAD==='1')await send('Page.reload',{ignoreCache:true});
await new Promise(r=>setTimeout(r,1800));
if(expressionFile){const result=await send('Runtime.evaluate',{expression:fs.readFileSync(expressionFile,'utf8'),awaitPromise:true,returnByValue:true});if(process.env.MOSS_RESULT)fs.writeFileSync(process.env.MOSS_RESULT,JSON.stringify(result.result.result.value,null,2));else console.log(JSON.stringify(result.result,null,2));}
if(screenshot){const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(screenshot,Buffer.from(result.result.data,'base64'));console.log('Screenshot '+screenshot);}
console.log('Page errors '+JSON.stringify(errors));ws.close();


