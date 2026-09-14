const fs=require('node:fs'),path=require('node:path');
const root=process.argv[2]||path.resolve(__dirname,'..');
const edit=(p,fn)=>{const f=path.join(root,p);fs.writeFileSync(f,fn(fs.readFileSync(f,'utf8')));};
edit('js/scene-renderer.js',s=>s.includes('npcId: npcId,')?s:s.replace('npc: !!npcId,','npc: !!npcId,\n                    npcId: npcId,'));
edit('data/npc/npc_supervisor_manager.json',s=>s.replace('assets/npc/npc_supervisor_manager/manager.png','assets/npc/npc_supervisor_manager/standing-smoking-v1.png'));
edit('js/core/tile-renderer-v2.js',s=>{
 if(s.includes('function drawLinPawn('))return s;
 const helper=`        var linImage = null, linReady = false, linShadow = null;
        function drawLinPawn(ctx,cx,cy,label) {
            if (!linImage) {
                linImage = new Image();
                linImage.onload = function () {
                    linReady = true;
                    linShadow = document.createElement('canvas');
                    linShadow.width = linImage.naturalWidth; linShadow.height = linImage.naturalHeight;
                    var sc = linShadow.getContext('2d');
                    sc.drawImage(linImage,0,0); sc.globalCompositeOperation='source-in';
                    sc.fillStyle='rgba(9,8,7,.24)'; sc.fillRect(0,0,linShadow.width,linShadow.height);
                    if(lastInput) render(lastInput);
                };
                linImage.src='assets/npc/npc_supervisor_manager/standing-smoking-v1.png';
            }
            if(!linReady)return false;
            // Source base center/bottom align with the player's +8px ground anchor.
            var scale=46/735, x=-608*scale, y=-1230*scale;
            ctx.save();ctx.translate(cx,cy+8);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
            ctx.save();ctx.transform(1,0,-.48,-.24,0,0);ctx.filter='blur(.7px)';
            ctx.drawImage(linShadow,x,y,1215*scale,1295*scale);ctx.restore();
            ctx.drawImage(linImage,x,y,1215*scale,1295*scale);ctx.restore();
            ctx.save();ctx.font='bold 12px "Microsoft YaHei",sans-serif';ctx.textAlign='center';ctx.textBaseline='bottom';
            ctx.lineWidth=3;ctx.strokeStyle='#211c19';ctx.strokeText(label||'林经理',cx,cy-67);
            ctx.fillStyle='#f3e9d9';ctx.fillText(label||'林经理',cx,cy-67);ctx.restore();return true;
        }
`;
 const marker='        function fallbackProjection(map) {';
 if(!s.includes(marker))throw Error('Missing projection insertion point');
 s=s.replace(marker,helper+marker);
 const branch='else if(m.npc){';
 if(!s.includes(branch))throw Error('Missing NPC branch');
 return s.replace(branch,"else if(m.npc && m.npcId==='npc.supervisor.manager' && projection.isIsometric && drawLinPawn(dynamicCtx,c.x,c.y,m.npcLabel)){}\n            "+branch);
});
const target=path.join(root,'assets/npc/npc_supervisor_manager');fs.mkdirSync(target,{recursive:true});
fs.copyFileSync(path.resolve(__dirname,'../reference/npc-lin-manager-v1/standing-smoking.png'),path.join(target,'standing-smoking-v1.png'));
console.log('Installed Lin manager standing pawn in '+root);
