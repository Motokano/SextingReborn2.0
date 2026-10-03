/**
 * Tile Renderer V2 — map layers and foreground combat driven by MapProjection.
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

        function makeGroundShadow(image, spec, footprint) {
            var crop = spec.crop, scale = spec.width / crop[2];
            var x = (crop[0] - spec.anchor[0]) * scale;
            var y = (crop[1] - spec.anchor[1]) * scale;
            var rx = footprint[0], depth = footprint[1];
            var shadow = document.createElement('canvas');
            shadow.width = 640; shadow.height = 352;
            var sc = shadow.getContext('2d');
            sc.scale(4,4); sc.translate(64,40);
            // Project the raised object from the CENTER of its ground footprint.
            sc.save(); sc.transform(1,0,-.48,-.24,-.48*depth,-1.24*depth);
            sc.drawImage(image,crop[0],crop[1],crop[2],crop[3],x,y,spec.width,crop[3]*scale);
            sc.restore();
            // Union an unflattened footprint swept 5px right / 2.5px down.
            // Its origin remains beneath the entire base, so the cast shade
            // meets the side rim continuously, as a real tabletop piece does.
            sc.fillStyle='#fff'; sc.beginPath();
            for(var i=0;i<=10;i++) {
                var dx=i*.5, dy=i*.25;
                sc.moveTo(dx+rx,-depth+dy);
                sc.ellipse(dx,-depth+dy,rx,depth,0,0,Math.PI*2);
                sc.closePath();
            }
            sc.fill();
            // Color the UNION once: overlapping body/base masks cannot produce
            // a second dark oval. Keep the near edge firm, the distant end softer.
            sc.globalCompositeOperation='source-in';
            var fade=sc.createLinearGradient(0,-depth,42,20);
            fade.addColorStop(0,'rgba(9,8,7,.46)');
            fade.addColorStop(.55,'rgba(9,8,7,.30)');
            fade.addColorStop(1,'rgba(9,8,7,.10)');
            sc.fillStyle=fade; sc.fillRect(-64,-40,160,88);
            return shadow;
        }


    function create(mapGridEl, options) {
        var opts = options || {};
        var cellPx = opts.cellPx || 101;
        var staticCanvas = createCanvas('map-grid-canvas-static', mapGridEl);
        var dynamicCanvas = createCanvas('map-grid-canvas-dynamic', mapGridEl);
        var fxCanvas = createCanvas('map-grid-canvas-fx', mapGridEl);
        // The DOM player lives above map-grid's transformed stacking context.
        // Combat needs its own synchronized foreground surface, above that pawn.
        var combatCanvas = createCanvas('map-grid-canvas-combat', opts.combatHost || mapGridEl);
        if(opts.combatHost)combatCanvas.style.zIndex='21';
        var staticCtx = staticCanvas.getContext('2d');
        var dynamicCtx = dynamicCanvas.getContext('2d');
        var fxCtx = fxCanvas.getContext('2d');
        var combatCtx = combatCanvas.getContext('2d');
        var combatEffectsRenderer = null;
        var scene = { map: null, st: null, dynamicMetaAt: null };
        var projection = null;
        var staticMapKey = '', staticDataKey = '', staticSizeKey = '';
        var lastInput = null;
        var effectsRenderer = typeof opts.effectsRenderer === 'function' ? opts.effectsRenderer : null;
        var animationLoopId = null, animationLoopEnabled = false;
        var presentationNow = nowMs(), hadPawnMotion = false;
        var presentationCombatNow=presentationNow;
        var useCombatClock=!!(global.CombatFxRuntime&&!opts.getAnimationTime);
        if(useCombatClock)global.CombatFxRuntime.startPlaybackClock(presentationNow);
        var combatPixelRatio=1;
        var spriteSources = {
            npc: 'assets/map/isometric/npc-pawn-v2.png',
            enemy: 'assets/map/isometric/enemy-pawn-v2.png'
        };
        // Small vector ground materials are cached on the static layer, below fog and entities.
        var groundMaterials = {};
        ['stone', 'rock', 'moss'].forEach(function (kind) {
            var image = new Image();
            image.onload = function () {
                groundMaterials[kind] = image;
                staticMapKey = '';
                if (lastInput) render(lastInput);
            };
            image.src = 'assets/map/terrain/' + kind + '.svg';
        });
        // Approved device pawns. Crop and anchor are source-image pixel coordinates;
        // sizes below describe visible content on a 144px tile, not transparent padding.
        var deviceSpecs = {
            sewing: { crop: [212,95,877,1033], anchor: [661,1127], width: 64, label: '缝纫台' },
            toolbench: { crop: [218,77,869,1055], anchor: [662,1131], width: 58, label: '工具台' },
            stove: { crop: [183,7,930,1187], anchor: [650,1193], width: 56, label: '灶台' },
            ranch: { crop: [107,127,1093,953], anchor: [652.5,1079], width: 72, label: '牧场' },
            farm: { crop: [217,125,941,900], anchor: [685,1024], width: 64, label: '农场' },
            bed: { crop: [106,34,1180,1083], anchor: [724.5,1116], width: 66, label: '床' },
            barrel: { crop: [198,80,1065,983], anchor: [661,1062], width: 64, label: '制肥桶' },
            pharmacy: { crop: [223,80,863,1046], anchor: [659.5,1125], width: 58, label: '制药台' },
            warehouse: { crop: [255,95,804,1019], anchor: [659.5,1113], width: 54, label: '仓库' }
        };
        Object.keys(deviceSpecs).forEach(function (key) {
            spriteSources[key] = 'assets/map/isometric/interactive-devices-v1/' + key + '.png';
        });
        // Ground footprint of each oval base in display pixels at 144px tile width.
        // A base is already on the ground plane; it must not be flattened again.
        var deviceFootprints = {
            sewing: [32,10.5],
            toolbench: [29,10],
            stove: [28,9], ranch: [36,13], farm: [32,11.5], bed: [33,11.5],
            barrel: [27.5,9], pharmacy: [29,10], warehouse: [27,9]
        };
        // Character art shares calibrated placement and the merged ground shadow.
        var pawnSpecs = Object.assign({}, deviceSpecs, {
            linManager: {crop:[276,44,666,1208],anchor:[607.5,1251],width:46,label:'林经理'},
            streetThug: {crop:[230,38,757,1216],anchor:[609.5,1253],width:46,label:'地痞'}
        });
        spriteSources.streetThug = 'assets/map/isometric/street-thug-v1/standing.png';
        deviceFootprints.streetThug = [23,7];
        spriteSources.linManager = 'assets/npc/npc_supervisor_manager/standing-mailbag-v2.png';
        deviceFootprints.linManager = [23,7];
        // Dialogue reads the same sources and crops as map pawns.
        global.TileRendererV2.getSpeakerPawn = function (entityId) {
            var key = entityId === 'npc.station.sewing_base' ? 'sewing' : entityId === 'npc.station.observation_base' ? 'toolbench' :
                entityId === 'npc.supervisor.manager' ? 'linManager' :
                entityId === 'enemy.street_thug' ? 'streetThug' : 'npc';
            return {url:spriteSources[key],crop:pawnSpecs[key] ? pawnSpecs[key].crop.slice() : null};
        };
        var spriteCache = {};


        function getSprite(key) {
            var cached = spriteCache[key];
            if (cached && (!cached.failed || nowMs() < cached.retryAt)) {
                return cached.ready ? cached.image : null;
            }
            var image = new Image();
            cached = spriteCache[key] = { image: image, ready: false, failed: false };
            image.onload = function () {
                var spec = pawnSpecs[key];
                if (spec) {
                    cached.shadow = makeGroundShadow(image, spec, deviceFootprints[key]);
                }
                cached.ready = true;
                if (lastInput) render(lastInput);
            };
            image.onerror = function () {
                cached.failed = true;
                // A temporary server outage must not hide this pawn forever.
                // Retry on a subsequent render, with a cooldown to avoid request floods.
                cached.retryAt = nowMs() + 5000;
            };
            image.src = spriteSources[key];
            return null;
        }

        function deviceKeyForMeta(m) {
            if (m.npcId === 'npc.station.sewing_base') return 'sewing';
            if (m.npcId === 'npc.station.observation_base') return 'toolbench';
            if (m.cookingStation) return 'stove';
            if (m.pharmacyStation) return 'pharmacy';
            if (m.compostStation) return 'barrel';
            if (m.agricultureStation) return 'farm';
            if (m.livestockStation) return 'ranch';
            if (m.bedStation) return 'bed';
            if (m.warehouseStation) return 'warehouse';
            return null;
        }

        function drawCalibratedPawn(ctx, key, cx, cy, label) {
            var spec = pawnSpecs[key], image = getSprite(key);
            var unit = projection.tileWidth / 144;
            var crop = spec.crop, scale = spec.width * unit / crop[2];
            var width = crop[2] * scale, height = crop[3] * scale;
            var x = (crop[0] - spec.anchor[0]) * scale;
            var y = (crop[1] - spec.anchor[1]) * scale;
            if (image) {
                ctx.save(); ctx.translate(cx, cy + 8 * unit);
                ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
                ctx.save(); ctx.filter = 'blur(.35px)';
                ctx.drawImage(spriteCache[key].shadow,-64*unit,-40*unit,160*unit,88*unit);
                ctx.restore();
                ctx.drawImage(image, crop[0], crop[1], crop[2], crop[3], x, y, width, height);
                ctx.restore();
                drawSpriteLabel(ctx, label || spec.label, cx, cy + 8 * unit + y - 4 * unit);
            } else {
                // Keep a recognizable device label during loading or failure, never a person.
                drawSpriteLabel(ctx, label || spec.label, cx, cy - 9 * unit);
            }
        }

        function drawSprite(ctx, key, cx, footY, maxWidth, maxHeight) {
            var image = getSprite(key);
            if (!image || !image.naturalWidth || !image.naturalHeight) return false;
            var scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
            var width = image.naturalWidth * scale;
            var height = image.naturalHeight * scale;
            ctx.save();
            if (key === 'npc') {
                // Anchor to visible alpha, preserving the existing body placement.
                var ax = cx - width / 2 + 574 * scale;
                var ay = footY - height + 1121 * scale;
                var cached = spriteCache[key];
                if (!cached.shadow || cached.shadowScale !== scale) {
                    cached.shadow = makeGroundShadow(image,{crop:[0,0,1145,1374],anchor:[574,1121],width:width},[222*scale,65*scale]);
                    cached.shadowScale = scale;
                }
                ctx.save();ctx.filter='blur(.35px)';
                ctx.drawImage(cached.shadow,ax-64,ay-40,160,88);ctx.restore();
            } else {
            ctx.fillStyle = 'rgba(0,0,0,.32)';
            ctx.beginPath();
            ctx.ellipse(cx, footY + 1, maxWidth * .28, maxWidth * .09, 0, 0, Math.PI * 2);
            ctx.fill();
            }
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
            // Same backing resolution as the demo: subpixel dry-brush strands
            // must not be blurred by stretching a 1x bitmap on a high-DPI screen.
            combatPixelRatio=global.devicePixelRatio||1;
            var cw=Math.round(w*combatPixelRatio),ch=Math.round(h*combatPixelRatio);
            if(combatCanvas.width!==cw)combatCanvas.width=cw;
            if(combatCanvas.height!==ch)combatCanvas.height=ch;
            combatCtx.setTransform(combatPixelRatio,0,0,combatPixelRatio,0,0);
            combatCanvas.style.width=w+'px';combatCanvas.style.height=h+'px';
            mapGridEl.style.width = w + 'px'; mapGridEl.style.height = h + 'px';
        }
        function colorForCell(m) {
            if (m.portal) return '#365e65';
            if (m.gathering || m.agricultureStation) return '#526b38';
            if (m.cookingStation || m.livestockStation || m.compostStation) return '#69543b';
            if (m.pharmacyStation) return '#3b6055';
            if (m.warehouseStation) return '#635b44';
            return m.walkable ? '#53584a' : '#303d4d';
        }
        function strokeForCell(m) {
            if (m.portal) return 'rgba(143,199,201,.65)';
            if (m.gathering || m.agricultureStation) return 'rgba(171,193,113,.58)';
            if (m.cookingStation || m.livestockStation || m.compostStation || m.warehouseStation) return 'rgba(201,170,115,.52)';
            return m.walkable ? 'rgba(184,184,149,.18)' : 'rgba(135,156,181,.44)';
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
        function drawStaticCell(gx, gy, m) {
            var ctx = staticCtx, points = projection.cellPolygon(gx, gy);
            var kind = m.gathering || m.agricultureStation ? 'moss' : (m.walkable ? 'stone' : 'rock');
            var material = groundMaterials[kind];
            paintCell(ctx, gx, gy, colorForCell(m), null, 1, 0);
            if (material) {
                ctx.save();
                trace(ctx, points, 0); ctx.clip();
                // Map a square onto the actual tile axes in both supported projections.
                ctx.transform((points[1].x-points[0].x)/256, (points[1].y-points[0].y)/256,
                    (points[3].x-points[0].x)/256, (points[3].y-points[0].y)/256, points[0].x, points[0].y);
                ctx.translate(128,128);
                ctx.rotate(((gx*13+gy*7)&3)*Math.PI/2);
                // Preserve category tints beneath the common surface grain.
                var tinted = m.portal || m.cookingStation || m.livestockStation || m.compostStation || m.pharmacyStation || m.warehouseStation;
                ctx.globalAlpha = tinted ? .34 : .76;
                ctx.drawImage(material,-128,-128,256,256);
                ctx.restore();
            }
            // Stable, faint variation breaks repetition without frame-to-frame flicker.
            var variation = ((gx*37+gy*17)%7-3)*.012;
            paintCell(ctx,gx,gy,variation>0?'rgba(216,207,170,'+variation+')':'rgba(10,24,18,'+(-variation)+')',strokeForCell(m),1,.5);
        }
        function drawExteriorWalls(map){
            if(!projection.isIsometric||!(projection.thickness>0))return;
            var d=projection.thickness,gx,gy,p;
            staticCtx.save();
            for(gy=0;gy<map.height;gy++){
                p=projection.cellPolygon(map.width-1,gy); staticCtx.beginPath(); staticCtx.moveTo(p[1].x,p[1].y);staticCtx.lineTo(p[2].x,p[2].y);staticCtx.lineTo(p[2].x,p[2].y+d);staticCtx.lineTo(p[1].x,p[1].y+d);staticCtx.closePath();staticCtx.fillStyle='#18231e';staticCtx.fill();staticCtx.strokeStyle='rgba(255,255,255,.08)';staticCtx.stroke();
            }
            for(gx=0;gx<map.width;gx++){
                p=projection.cellPolygon(gx,map.height-1); staticCtx.beginPath();staticCtx.moveTo(p[2].x,p[2].y);staticCtx.lineTo(p[3].x,p[3].y);staticCtx.lineTo(p[3].x,p[3].y+d);staticCtx.lineTo(p[2].x,p[2].y+d);staticCtx.closePath();staticCtx.fillStyle='#26332a';staticCtx.fill();staticCtx.strokeStyle='rgba(255,255,255,.07)';staticCtx.stroke();
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
            if(m.adjacent&&!m.leapTarget)paintCell(dynamicCtx,gx,gy,'rgba(217,212,173,.055)',null,0,2);
            if(m.leapTarget)paintCell(dynamicCtx,gx,gy,'rgba(139,181,177,.14)','rgba(139,181,177,.82)',2,2);
            if(m.player)paintCell(dynamicCtx,gx,gy,'rgba(197,176,131,.10)','rgba(215,193,145,.95)',2,2);
        }
        function drawEntity(gx,gy,m){
            var c=projection.cellCenter(gx,gy), lift=projection.isIsometric?18:0;
            if(m.enemy&&global.CombatFxRuntime){
                var motion=global.CombatFxRuntime.getPawnOffsetAt(gx,gy,'enemy',{nowMs:presentationNow,combatNowMs:presentationCombatNow,cellPx:cellPx,projection:projection,cellCenter:projection.cellCenter});
                c.x+=motion.x;c.y+=motion.y;
            }
            var deviceKey = deviceKeyForMeta(m);
            dynamicCtx.textAlign='center';dynamicCtx.textBaseline='middle';
            if(m.unknownPresence){dynamicCtx.fillStyle='rgba(245,222,179,.95)';dynamicCtx.font='bold 20px sans-serif';dynamicCtx.fillText('?',c.x,c.y-lift);}
            else if(projection.isIsometric && deviceKey && !m.enemy && (!m.npc || String(m.npcId || '').indexOf('npc.station.') === 0)) {
                drawCalibratedPawn(dynamicCtx, deviceKey, c.x, c.y, m.npcLabel);
            }
            else if(m.npc && m.npcId==='npc.supervisor.manager' && projection.isIsometric){drawCalibratedPawn(dynamicCtx,'linManager',c.x,c.y,m.npcLabel);}
            else if(m.npc){
                if(projection.isIsometric){
                    if(!drawSprite(dynamicCtx,'npc',c.x,c.y,58,74)) drawPawn(dynamicCtx,c.x,c.y,'#a992d7','#261e34','');
                    drawSpriteLabel(dynamicCtx,m.npcLabel||'',c.x,c.y-77);
                }else{dynamicCtx.fillStyle='rgba(210,190,255,.95)';dynamicCtx.font='bold 13px sans-serif';dynamicCtx.fillText(m.npcLabel||'•',c.x,c.y);}
            }
            else if(m.enemy){
                if(projection.isIsometric){
                    if(m.enemyId==='enemy.street_thug') drawCalibratedPawn(dynamicCtx,'streetThug',c.x,c.y,'地痞');
                    else if(m.enemyId==='enemy.training_dummy_wooden'||!drawSprite(dynamicCtx,'enemy',c.x,c.y,64,78)) drawPawn(dynamicCtx,c.x,c.y,m.enemyId==='enemy.training_dummy_wooden'?'#8b5a2b':'#c65353','#351b1b','');
                }else{dynamicCtx.fillStyle=m.enemyId==='enemy.training_dummy_wooden'?'#8b5a2b':'#f87171';dynamicCtx.beginPath();dynamicCtx.arc(c.x,c.y,8,0,Math.PI*2);dynamicCtx.fill();}
            }
            else if(deviceKey){
                var lab={stove:'灶',pharmacy:'药',barrel:'肥',farm:'农',ranch:'牧',bed:'床',warehouse:'仓',toolbench:'工具台'}[deviceKey];
                dynamicCtx.fillStyle=m.agricultureStation?'#4ade80':(m.livestockStation?'#fb923c':(m.warehouseStation?'#d3a060':'#f59e5b'));
                dynamicCtx.font='bold 20px "Microsoft YaHei",sans-serif';dynamicCtx.fillText(lab,c.x,c.y-(projection.isIsometric?9:0));
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
            presentationNow=typeof opts.getAnimationTime==='function'?opts.getAnimationTime(nowMs()):nowMs();
            presentationCombatNow=useCombatClock?global.CombatFxRuntime.getPlaybackTime():presentationNow;
            lastInput=nextScene;scene.map=nextScene.map;scene.st=nextScene.st;scene.dynamicMetaAt=nextScene.dynamicMetaAt||nextScene.metaAt;
            if(!scene.map||!scene.st||typeof scene.dynamicMetaAt!=='function')return;
            projection=makeProjection(scene.map);resize(projection.widthPx,projection.heightPx);ensureStatic(nextScene);
            var dirty=Array.isArray(nextScene.dirtyCells)?nextScene.dirtyCells:null;
            if(!projection.isIsometric&&dirty&&dirty.length){var seen={};for(var i=0;i<dirty.length;i++){var d=dirty[i];if(!d||d.x==null||d.y==null)continue;var gx=d.x|0,gy=d.y|0,k=gx+','+gy;if(seen[k]||gx<0||gy<0||gx>=scene.map.width||gy>=scene.map.height)continue;seen[k]=1;dynamicCtx.clearRect(gx*cellPx-2,gy*cellPx-2,cellPx+4,cellPx+4);var m=scene.dynamicMetaAt(gx,gy);drawOverlay(gx,gy,m);drawEntity(gx,gy,m);}}else drawFullDynamic(nextScene);
            renderFxLayer(presentationNow);
        }
        function renderFxLayer(ts){
            fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);combatCtx.clearRect(0,0,combatCanvas.width,combatCanvas.height);
            if(!scene.map||!scene.st||!projection)return;
            var frame={ctx:fxCtx,nowMs:ts,combatNowMs:useCombatClock?global.CombatFxRuntime.getPlaybackTime():ts,map:scene.map,state:scene.st,cellPx:cellPx,cellToPx:projection.cellToPx,cellCenter:projection.cellCenter,cellPolygon:projection.cellPolygon,projection:projection,mapWidthPx:projection.widthPx,mapHeightPx:projection.heightPx};
            try{if(effectsRenderer)effectsRenderer(frame);if(combatEffectsRenderer)combatEffectsRenderer(Object.assign({},frame,{ctx:combatCtx}));}catch(e){}
        }
        function tick(ts){
            if(!animationLoopEnabled)return;
            presentationNow=typeof opts.getAnimationTime==='function'?opts.getAnimationTime(ts):ts;
            presentationCombatNow=useCombatClock?global.CombatFxRuntime.advancePlaybackClock(ts):presentationNow;
            if(lastInput){
                var moving=!!(global.CombatFxRuntime&&global.CombatFxRuntime.hasPawnMotion(presentationCombatNow));
                if(moving||hadPawnMotion)drawFullDynamic(lastInput);
                hadPawnMotion=moving;renderFxLayer(presentationNow);
            }
            animationLoopId=requestAnimationFrame(tick);
        }
        function start(){if(animationLoopEnabled)return;animationLoopEnabled=true;animationLoopId=requestAnimationFrame(tick);}
        function stop(){animationLoopEnabled=false;if(animationLoopId){cancelAnimationFrame(animationLoopId);animationLoopId=null;}}
        function hitTest(clientX,clientY){if(!scene.map||!projection)return null;var rect=mapGridEl.getBoundingClientRect(),h=projection.pick(clientX-rect.left,clientY-rect.top);if(!h||h.x<0||h.y<0||h.x>=scene.map.width||h.y>=scene.map.height)return null;return h;}
        function setHoverCursor(x,y,turnOnly){var h=hitTest(x,y);if(!h||!scene.dynamicMetaAt){mapGridEl.style.cursor='default';return;}var m=scene.dynamicMetaAt(h.x,h.y);mapGridEl.style.cursor=((turnOnly&&m.adjacent)||m.leapTarget||(m.adjacent&&(m.walkable||m.npc||m.enemy)))?'pointer':'default';}
        function invalidate(){staticMapKey='';staticDataKey='';staticSizeKey='';staticCtx.clearRect(0,0,staticCanvas.width,staticCanvas.height);dynamicCtx.clearRect(0,0,dynamicCanvas.width,dynamicCanvas.height);fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);combatCtx.clearRect(0,0,combatCanvas.width,combatCanvas.height);}
        return {render:render,hitTest:hitTest,setCamera:function(x,y){mapGridEl.style.transform='translate('+x+'px, '+y+'px)';if(opts.combatHost)combatCanvas.style.transform=mapGridEl.style.transform;},getCellCenter:function(x,y){return projection?projection.cellCenter(x,y):{x:(x+.5)*cellPx,y:(y+.5)*cellPx};},getProjection:function(){return projection;},setHoverCursor:setHoverCursor,setCombatEffectsRenderer:function(fn){combatEffectsRenderer=typeof fn==='function'?fn:null;},setEffectsRenderer:function(fn){effectsRenderer=typeof fn==='function'?fn:null;},startAnimationLoop:start,stopAnimationLoop:stop,renderFxLayer:function(ts){renderFxLayer(ts!=null?ts:nowMs());},invalidateStatic:invalidate};
    }
    global.TileRendererV2={create:create,clamp:clamp,makeGroundShadow:makeGroundShadow};
})(typeof window !== 'undefined' ? window : this);
