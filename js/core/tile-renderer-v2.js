/**
 * Tile Renderer V2 — three canvas layers driven by MapProjection.
 */
(function (global) {
    'use strict';

    function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    function createCanvas(id, host) {
        var c = document.createElement('canvas');
        c.id = id;
        c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
        host.appendChild(c);
        return c;
    }

    function create(mapGridEl, options) {
        var opts = options || {};
        var cellPx = opts.cellPx || 101;
        var staticCanvas = createCanvas('map-grid-canvas-static', mapGridEl);
        var dynamicCanvas = createCanvas('map-grid-canvas-dynamic', mapGridEl);
        var fxCanvas = createCanvas('map-grid-canvas-fx', mapGridEl);
        var staticCtx = staticCanvas.getContext('2d');
        var dynamicCtx = dynamicCanvas.getContext('2d');
        var fxCtx = fxCanvas.getContext('2d');
        var scene = { map: null, st: null, dynamicMetaAt: null };
        var projection = null;
        var staticMapKey = '', staticDataKey = '', staticSizeKey = '';
        var lastInput = null;
        var effectsRenderer = typeof opts.effectsRenderer === 'function' ? opts.effectsRenderer : null;
        var animationLoopId = null, animationLoopEnabled = false;
        var spriteSources = {
            npc: 'assets/map/isometric/npc-pawn-v2.png',
            enemy: 'assets/map/isometric/enemy-pawn-v2.png',
            livestock: 'assets/map/isometric/livestock-station-v1.png'
        };
        var spriteCache = {};

        function getSprite(key) {
            var cached = spriteCache[key];
            if (cached) return cached.ready ? cached.image : null;
            var image = new Image();
            cached = spriteCache[key] = { image: image, ready: false, failed: false };
            image.onload = function () {
                cached.ready = true;
                if (lastInput) render(lastInput);
            };
            image.onerror = function () { cached.failed = true; };
            image.src = spriteSources[key];
            return null;
        }

        function drawSprite(ctx, key, cx, footY, maxWidth, maxHeight) {
            var image = getSprite(key);
            if (!image || !image.naturalWidth || !image.naturalHeight) return false;
            var scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
            var width = image.naturalWidth * scale;
            var height = image.naturalHeight * scale;
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,.32)';
            ctx.beginPath();
            ctx.ellipse(cx, footY + 1, maxWidth * .28, maxWidth * .09, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.drawImage(image, cx - width / 2, footY - height, width, height);
            ctx.restore();
            return true;
        }

        function drawSpriteLabel(ctx, label, cx, y) {
            var text = String(label || '').trim();
            if (!text) return;
            if (text.length > 6) text = text.slice(0, 6);
            ctx.save();
            ctx.font = 'bold 12px "Microsoft YaHei","PingFang SC",sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(18,14,12,.9)';
            ctx.strokeText(text, cx, y);
            ctx.fillStyle = '#f3e9d9';
            ctx.fillText(text, cx, y);
            ctx.restore();
        }

        var linImage = null, linReady = false, linShadow = null;
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
        function fallbackProjection(map) {
            return {
                mode: 'legacy', isIsometric: false, cellPx: cellPx, tileWidth: cellPx, tileHeight: cellPx,
                thickness: 0, widthPx: map.width * cellPx, heightPx: map.height * cellPx,
                cellCenter: function (x, y) { return { x: (x + .5) * cellPx, y: (y + .5) * cellPx }; },
                cellToPx: function (x, y) { return { x: x * cellPx, y: y * cellPx }; },
                cellPolygon: function (x, y) { var px=x*cellPx,py=y*cellPx; return [{x:px,y:py},{x:px+cellPx,y:py},{x:px+cellPx,y:py+cellPx},{x:px,y:py+cellPx}]; },
                pick: function (px, py) { return { x: Math.floor(px / cellPx), y: Math.floor(py / cellPx) }; },
                directionVector: function (dx, dy) { return { x: dx * cellPx, y: dy * cellPx }; }
            };
        }
        function makeProjection(map) {
            return global.MapProjection && typeof global.MapProjection.create === 'function'
                ? global.MapProjection.create(map, cellPx) : fallbackProjection(map);
        }
        function resize(w, h) {
            w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
            [staticCanvas, dynamicCanvas, fxCanvas].forEach(function (c) { if (c.width !== w) c.width = w; if (c.height !== h) c.height = h; });
            mapGridEl.style.width = w + 'px'; mapGridEl.style.height = h + 'px';
        }
        function colorForCell(m) {
            if (!m.walkable) {
                if (m.cookingStation) return '#3d2b1f'; if (m.pharmacyStation) return '#1e2d2c';
                if (m.compostStation) return '#2f2f18'; if (m.agricultureStation) return '#243820';
                if (m.livestockStation) return '#3d3018'; if (m.warehouseStation) return '#2a2838'; return '#3d2a2a';
            }
            if (m.portal) return '#2a2d35'; if (m.gathering) return '#2a3324'; if (m.groundCount > 0) return '#332a24';
            if (m.pharmacyStation) return '#243530'; if (m.compostStation) return '#363620'; if (m.livestockStation) return '#3a3118'; return '#312a24';
        }
        function strokeForCell(m) {
            if (!m.walkable) {
                if (m.cookingStation) return 'rgba(251,146,60,.5)'; if (m.pharmacyStation) return 'rgba(45,212,191,.45)';
                if (m.compostStation) return 'rgba(202,138,4,.45)'; if (m.agricultureStation) return 'rgba(74,222,128,.45)';
                if (m.livestockStation) return 'rgba(255,140,0,.55)'; if (m.warehouseStation) return 'rgba(211,160,96,.5)'; return 'rgba(180,80,80,.4)';
            }
            if (m.portal) return 'rgba(100,200,255,.35)'; if (m.gathering) return 'rgba(120,180,80,.45)';
            if (m.groundCount > 0) return 'rgba(212,163,115,.5)'; if (m.pharmacyStation) return 'rgba(45,212,191,.22)';
            if (m.compostStation) return 'rgba(202,138,4,.22)'; if (m.livestockStation) return 'rgba(255,140,0,.28)'; return 'rgba(255,255,255,.10)';
        }
        function trace(ctx, pts, inset) {
            var cx=0,cy=0,i; for(i=0;i<pts.length;i++){cx+=pts[i].x;cy+=pts[i].y;} cx/=pts.length;cy/=pts.length;
            ctx.beginPath();
            for(i=0;i<pts.length;i++){
                var p=pts[i], d=Math.max(1,Math.hypot(p.x-cx,p.y-cy)), k=inset?Math.max(0,1-inset/d):1;
                var x=cx+(p.x-cx)*k,y=cy+(p.y-cy)*k; if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);
            }
            ctx.closePath();
        }
        function paintCell(ctx,gx,gy,fill,stroke,width,inset){
            trace(ctx,projection.cellPolygon(gx,gy),inset||0);
            if(fill){ctx.fillStyle=fill;ctx.fill();} if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width||1;ctx.stroke();}
        }
        function drawStaticCell(gx,gy,m){paintCell(staticCtx,gx,gy,colorForCell(m),strokeForCell(m),1,projection.isIsometric?.6:1);}
        function drawExteriorWalls(map){
            if(!projection.isIsometric||!(projection.thickness>0))return;
            var d=projection.thickness,gx,gy,p;
            staticCtx.save();
            for(gy=0;gy<map.height;gy++){
                p=projection.cellPolygon(map.width-1,gy); staticCtx.beginPath(); staticCtx.moveTo(p[1].x,p[1].y);staticCtx.lineTo(p[2].x,p[2].y);staticCtx.lineTo(p[2].x,p[2].y+d);staticCtx.lineTo(p[1].x,p[1].y+d);staticCtx.closePath();staticCtx.fillStyle='#191311';staticCtx.fill();staticCtx.strokeStyle='rgba(255,255,255,.08)';staticCtx.stroke();
            }
            for(gx=0;gx<map.width;gx++){
                p=projection.cellPolygon(gx,map.height-1); staticCtx.beginPath();staticCtx.moveTo(p[2].x,p[2].y);staticCtx.lineTo(p[3].x,p[3].y);staticCtx.lineTo(p[3].x,p[3].y+d);staticCtx.lineTo(p[2].x,p[2].y+d);staticCtx.closePath();staticCtx.fillStyle='#241b16';staticCtx.fill();staticCtx.strokeStyle='rgba(255,255,255,.07)';staticCtx.stroke();
            }
            staticCtx.restore();
        }
        function drawPawn(ctx,cx,footY,color,outline,label){
            var s=Math.max(.66,cellPx/101),hy=footY-47*s;
            ctx.save();ctx.fillStyle='rgba(0,0,0,.34)';ctx.beginPath();ctx.ellipse(cx,footY+1,20*s,7*s,0,0,Math.PI*2);ctx.fill();
            ctx.fillStyle=color;ctx.strokeStyle=outline||'rgba(0,0,0,.78)';ctx.lineWidth=Math.max(1.2,1.8*s);
            ctx.beginPath();ctx.ellipse(cx,footY-5*s,17*s,7*s,0,0,Math.PI*2);ctx.fill();ctx.stroke();
            ctx.beginPath();ctx.moveTo(cx-12*s,footY-8*s);ctx.quadraticCurveTo(cx-7*s,footY-31*s,cx-5*s,hy+8*s);ctx.lineTo(cx+5*s,hy+8*s);ctx.quadraticCurveTo(cx+7*s,footY-31*s,cx+12*s,footY-8*s);ctx.closePath();ctx.fill();ctx.stroke();
            ctx.beginPath();ctx.arc(cx,hy,8*s,0,Math.PI*2);ctx.fill();ctx.stroke();
            if(label){var lab=String(label).trim();if(lab.length>6)lab=lab.slice(0,6);ctx.font='bold 12px "Microsoft YaHei","PingFang SC",sans-serif';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.lineWidth=3;ctx.strokeStyle='rgba(18,14,12,.9)';ctx.strokeText(lab,cx,hy-12*s);ctx.fillStyle='#f3e9d9';ctx.fillText(lab,cx,hy-12*s);}ctx.restore();
        }
        function drawOverlay(gx,gy,m){
            if(m.adjacent&&!m.leapTarget)paintCell(dynamicCtx,gx,gy,'rgba(255,255,255,.055)',null,0,2);
            if(m.leapTarget)paintCell(dynamicCtx,gx,gy,'rgba(56,189,248,.14)','rgba(56,189,248,.72)',2,2);
            if(m.player)paintCell(dynamicCtx,gx,gy,'rgba(251,191,36,.07)','rgba(251,191,36,.9)',2,2);
        }
        function drawEntity(gx,gy,m){
            var c=projection.cellCenter(gx,gy), lift=projection.isIsometric?18:0;
            dynamicCtx.textAlign='center';dynamicCtx.textBaseline='middle';
            if(m.unknownPresence){dynamicCtx.fillStyle='rgba(245,222,179,.95)';dynamicCtx.font='bold 20px sans-serif';dynamicCtx.fillText('?',c.x,c.y-lift);}
            else if(m.npc && m.npcId==='npc.supervisor.manager' && projection.isIsometric && drawLinPawn(dynamicCtx,c.x,c.y,m.npcLabel)){}
            else if(m.npc){
                if(projection.isIsometric){
                    if(!drawSprite(dynamicCtx,'npc',c.x,c.y,58,74)) drawPawn(dynamicCtx,c.x,c.y,'#a992d7','#261e34','');
                    drawSpriteLabel(dynamicCtx,m.npcLabel||'',c.x,c.y-77);
                }else{dynamicCtx.fillStyle='rgba(210,190,255,.95)';dynamicCtx.font='bold 13px sans-serif';dynamicCtx.fillText(m.npcLabel||'•',c.x,c.y);}
            }
            else if(m.enemy){
                if(projection.isIsometric){
                    if(m.enemyId==='enemy.training_dummy_wooden'||!drawSprite(dynamicCtx,'enemy',c.x,c.y,64,78)) drawPawn(dynamicCtx,c.x,c.y,m.enemyId==='enemy.training_dummy_wooden'?'#8b5a2b':'#c65353','#351b1b','');
                }else{dynamicCtx.fillStyle=m.enemyId==='enemy.training_dummy_wooden'?'#8b5a2b':'#f87171';dynamicCtx.beginPath();dynamicCtx.arc(c.x,c.y,8,0,Math.PI*2);dynamicCtx.fill();}
            }
            else if(m.cookingStation||m.pharmacyStation||m.compostStation||m.agricultureStation||m.livestockStation||m.warehouseStation){
                if(!(projection.isIsometric&&m.livestockStation&&drawSprite(dynamicCtx,'livestock',c.x,c.y+7,88,72))){
                    var lab=m.cookingStation?'灶':(m.pharmacyStation?'药':(m.compostStation?'肥':(m.agricultureStation?'农':(m.livestockStation?'牧':'仓'))));
                    dynamicCtx.fillStyle=m.agricultureStation?'#4ade80':(m.livestockStation?'#fb923c':(m.warehouseStation?'#d3a060':'#f59e5b'));
                    dynamicCtx.font='bold 20px "Microsoft YaHei",sans-serif';dynamicCtx.fillText(lab,c.x,c.y-(projection.isIsometric?9:0));
                }
            }
            if(m.portal&&m.portal.label){var pl=String(m.portal.label).trim();if(pl.length>6)pl=pl.slice(0,6);dynamicCtx.fillStyle='#7dd3fc';dynamicCtx.font='bold 12px sans-serif';dynamicCtx.fillText(pl,c.x,c.y+(projection.isIsometric?12:0));}
            if(m.groundCount>0||m.groundUnknown){dynamicCtx.fillStyle='#d4a373';dynamicCtx.font='14px sans-serif';dynamicCtx.fillText(m.groundCount>0?'📦':'?',c.x+projection.tileWidth*.27,c.y+projection.tileHeight*.17);}
        }
        function ensureStatic(nextScene){
            var map=nextScene.map,key=(map.map_id||'map')+':'+map.width+'x'+map.height+':'+(map.version||0)+':'+projection.mode,data=nextScene.staticDataKey||'',size=staticCanvas.width+'x'+staticCanvas.height;
            if(staticMapKey===key&&staticDataKey===data&&staticSizeKey===size)return;
            staticMapKey=key;staticDataKey=data;staticSizeKey=size;staticCtx.clearRect(0,0,staticCanvas.width,staticCanvas.height);
            var metaAt=nextScene.staticMetaAt||nextScene.dynamicMetaAt||function(){return{};};
            for(var sum=0;sum<=map.width+map.height-2;sum++)for(var gx=0;gx<map.width;gx++){var gy=sum-gx;if(gy>=0&&gy<map.height)drawStaticCell(gx,gy,metaAt(gx,gy));}
            drawExteriorWalls(map);
        }
        function visibleRange(nextScene){
            var map=nextScene.map,st=nextScene.st||{x:0,y:0},vp=nextScene.viewport||{width:1042,height:638};
            if(projection.isIsometric){var r=Math.ceil((vp.width||1042)/projection.tileWidth/2+(vp.height||638)/projection.tileHeight/2)+4;return{minX:clamp(st.x-r,0,map.width-1),maxX:clamp(st.x+r,0,map.width-1),minY:clamp(st.y-r,0,map.height-1),maxY:clamp(st.y+r,0,map.height-1)};}
            var hw=Math.ceil((vp.width||1042)/cellPx/2)+2,hh=Math.ceil((vp.height||638)/cellPx/2)+2;return{minX:clamp(st.x-hw,0,map.width-1),maxX:clamp(st.x+hw,0,map.width-1),minY:clamp(st.y-hh,0,map.height-1),maxY:clamp(st.y+hh,0,map.height-1)};
        }
        function drawFullDynamic(nextScene){
            dynamicCtx.clearRect(0,0,dynamicCanvas.width,dynamicCanvas.height);var vr=visibleRange(nextScene),cells=[];
            for(var gy=vr.minY;gy<=vr.maxY;gy++)for(var gx=vr.minX;gx<=vr.maxX;gx++){var m=scene.dynamicMetaAt(gx,gy);cells.push({x:gx,y:gy,m:m});drawOverlay(gx,gy,m);}
            cells.sort(function(a,b){var ca=projection.cellCenter(a.x,a.y),cb=projection.cellCenter(b.x,b.y);return ca.y-cb.y||ca.x-cb.x;});for(var i=0;i<cells.length;i++)drawEntity(cells[i].x,cells[i].y,cells[i].m);
        }
        function render(nextScene){
            lastInput=nextScene;scene.map=nextScene.map;scene.st=nextScene.st;scene.dynamicMetaAt=nextScene.dynamicMetaAt||nextScene.metaAt;
            if(!scene.map||!scene.st||typeof scene.dynamicMetaAt!=='function')return;
            projection=makeProjection(scene.map);resize(projection.widthPx,projection.heightPx);ensureStatic(nextScene);
            var dirty=Array.isArray(nextScene.dirtyCells)?nextScene.dirtyCells:null;
            if(!projection.isIsometric&&dirty&&dirty.length){var seen={};for(var i=0;i<dirty.length;i++){var d=dirty[i];if(!d||d.x==null||d.y==null)continue;var gx=d.x|0,gy=d.y|0,k=gx+','+gy;if(seen[k]||gx<0||gy<0||gx>=scene.map.width||gy>=scene.map.height)continue;seen[k]=1;dynamicCtx.clearRect(gx*cellPx-2,gy*cellPx-2,cellPx+4,cellPx+4);var m=scene.dynamicMetaAt(gx,gy);drawOverlay(gx,gy,m);drawEntity(gx,gy,m);}}else drawFullDynamic(nextScene);
            renderFxLayer(nowMs());
        }
        function renderFxLayer(ts){fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);if(!effectsRenderer||!scene.map||!scene.st||!projection)return;try{effectsRenderer({ctx:fxCtx,nowMs:ts,map:scene.map,state:scene.st,cellPx:cellPx,cellToPx:projection.cellToPx,cellCenter:projection.cellCenter,cellPolygon:projection.cellPolygon,projection:projection,mapWidthPx:projection.widthPx,mapHeightPx:projection.heightPx});}catch(e){}}
        function tick(ts){if(!animationLoopEnabled)return;if(lastInput)renderFxLayer(ts);animationLoopId=requestAnimationFrame(tick);}
        function start(){if(animationLoopEnabled)return;animationLoopEnabled=true;animationLoopId=requestAnimationFrame(tick);}
        function stop(){animationLoopEnabled=false;if(animationLoopId){cancelAnimationFrame(animationLoopId);animationLoopId=null;}}
        function hitTest(clientX,clientY){if(!scene.map||!projection)return null;var rect=mapGridEl.getBoundingClientRect(),h=projection.pick(clientX-rect.left,clientY-rect.top);if(!h||h.x<0||h.y<0||h.x>=scene.map.width||h.y>=scene.map.height)return null;return h;}
        function setHoverCursor(x,y,turnOnly){var h=hitTest(x,y);if(!h||!scene.dynamicMetaAt){mapGridEl.style.cursor='default';return;}var m=scene.dynamicMetaAt(h.x,h.y);mapGridEl.style.cursor=((turnOnly&&m.adjacent)||m.leapTarget||(m.adjacent&&(m.walkable||m.npc||m.enemy)))?'pointer':'default';}
        function invalidate(){staticMapKey='';staticDataKey='';staticSizeKey='';staticCtx.clearRect(0,0,staticCanvas.width,staticCanvas.height);dynamicCtx.clearRect(0,0,dynamicCanvas.width,dynamicCanvas.height);fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);}
        return {render:render,hitTest:hitTest,setCamera:function(x,y){mapGridEl.style.transform='translate('+x+'px, '+y+'px)';},getCellCenter:function(x,y){return projection?projection.cellCenter(x,y):{x:(x+.5)*cellPx,y:(y+.5)*cellPx};},getProjection:function(){return projection;},setHoverCursor:setHoverCursor,setEffectsRenderer:function(fn){effectsRenderer=typeof fn==='function'?fn:null;},startAnimationLoop:start,stopAnimationLoop:stop,renderFxLayer:function(ts){renderFxLayer(ts!=null?ts:nowMs());},invalidateStatic:invalidate};
    }
    global.TileRendererV2={create:create,clamp:clamp};
})(typeof window !== 'undefined' ? window : this);
