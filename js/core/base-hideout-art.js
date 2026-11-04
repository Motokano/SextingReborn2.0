/* Hideout art is a presentation layer. Coordinates, collision, production and saves stay in GameEngine. */
(function (global) {
  'use strict';
  var ROOT = 'assets/map/hideout-v1/';
  var config = {
    version: '20261025-courtyard-vision-v10',
    indoor: 'M0_Base_Inside_lv_1', outdoor: 'M0_Base_Outside_lv_1',
    materials: ['concrete','patched','steel','ceramic','wood','rubber','paving','earth','plaster','transition'],
    indoorZones: [
      {rect:[3,11,5,12],material:2}, {rect:[6,11,7,12],material:4},
      {rect:[10,7,13,10],material:5}, {rect:[13,11,14,12],material:2},
      {rect:[14,13,14,15],material:3}, {rect:[12,14,14,15],material:3},
      {rect:[9,14,11,15],material:4}
    ],
    // Wear follows two short service edges; the central passage stays continuous.
    patchZones: [[3,13,3,14],[14,7,14,8]],
    lights: [{x:11,y:6,side:'south'}, {x:14,y:6,side:'south'}, {x:3,y:11,side:'south'}, {x:9,y:9,side:'east'}],
    fittings: [{x:12,y:6,side:'south',kind:2}, {x:9,y:10,side:'east',kind:1}, {x:9,y:7,side:'east',kind:3}],
    props: {'14,13':{kind:0,width:54},'10,8':{kind:1,width:54},'11,8':{kind:1,width:54}},
    propRects: [[25,103,562,714],[633,12,574,842],[1294,14,459,839]],
    fittingRects: [[179,105,373,504],[773,56,369,571],[127,687,448,447],[680,782,559,265]],
    yard: {
      environment: {maxNightAlpha:.34,nightStrength:.65},
      paths: [[6,4,8,15],[2,5,12,6]],
      lawns: [[0,7,5,15],[10,0,15,5]],
      beds: [[9,7,10,10],[12,7,13,10],[9,12,10,14],[12,12,13,14]],
      windows: ['3,4,south','5,4,south','9,4,south','9,2,east'],
      lamps: ['6,4,south','8,4,south'],
      lampSize: {height:27,top:.3},
      door: '7,3,south',
      trees: ['1,7','5,11','14,2'],
      storage: {
        '2,5':{kind:1,width:82,anchor:[1001,492],feet:[[744,479],[884,318],[1255,519],[1123,616]]},
        '10,5':{kind:2,width:84,anchor:[349,1064],feet:[[112,1002],[234,970],[575,1063],[448,1112]]}
      },
      roofVents: ['5,2','8,2'],
      propRects: [[78,47,528,564],[720,164,557,463],[67,629,529,492],[717,683,537,445]],
      plantRects: [[106,288,684,376],[994,274,680,384]],
      fence: {height:.28,westStart:6,eastStart:5,exit:[6,8]},
      roofBase: .98, roofSlope: .07,
      cutaway: {width:.82,height:1.08,lift:.22,clearRadius:.72}
    }
  };
  var cache = {}, listeners = new Set(), requested = false, geometry = new WeakMap();
  function supports(map) { return !!map && !map.dungeon && (map.map_id === config.indoor || map.map_id === config.outdoor); }
  function usesGroundVisibility(map){return !!(supports(map)&&map.map_id===config.outdoor);}
  function buildingShown(m){return m.buildingVisible==null?!!m.terrainVisible:!!m.buildingVisible;}
  function visibleBuildingCells(map,metaAt){
    var visible=new Set();if(!usesGroundVisibility(map))return visible;
    var g=info(map);
    if(!g.buildingGroups){
      var remaining=new Set();g.blocked.forEach(function(key){var q=key.split(',').map(Number);if(structure(map,q[0],q[1]))remaining.add(key);});
      g.buildingGroups=[];
      while(remaining.size){
        var start=remaining.values().next().value,group=[start];remaining.delete(start);
        for(var i=0;i<group.length;i++){
          var q=group[i].split(',').map(Number);
          [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){var key=(q[0]+d[0])+','+(q[1]+d[1]);if(remaining.delete(key))group.push(key);});
        }
        g.buildingGroups.push(group);
      }
    }
    // Reveal only a seen building's shell as a whole, never its surrounding ground or contents.
    g.buildingGroups.forEach(function(group){
      if(group.some(function(key){var q=key.split(',').map(Number);return metaAt(q[0],q[1]).terrainVisible;}))group.forEach(function(key){visible.add(key);});
    });
    return visible;
  }
  function load(callback) {
    if (callback) listeners.add(callback);
    if (requested) return;
    requested = true;
    [['materials','material-atlas-v2.png'],['concrete','concrete-quiet.png'],['props','props-atlas-v2.png'],['fittings','fixtures-atlas.png'],['transition','transition-tile-v1.png'],['yardMaterials','courtyard-materials-v1.png'],['yardProps','courtyard-props-v1.png'],['yardPond','courtyard-pond-v1.png'],['yardPlants','courtyard-plants-v1.png']].forEach(function (entry) {
      var image = new Image();
      image.onload = function () { cache[entry[0]] = image; listeners.forEach(function (fn) { fn(); }); };
      image.onerror = function () { /* The quiet material fallback remains readable. */ };
      image.src = ROOT + entry[1];
    });
  }
  function info(map) {
    if (geometry.has(map)) return geometry.get(map);
    var blocked = new Set((map.blocks || []).map(function(p){return p.x+','+p.y;}));
    var disabled = new Set((map.disabled || []).map(function(p){return p.x+','+p.y;}));
    var facilities = new Set((map.npcs || []).map(function(p){return p.x+','+p.y;}));
    // The hideout cot extends into the preceding cell; this is furniture, not wall.
    if(map.map_id===config.indoor)facilities.add('11,14');
    var trainingDummies = new Set((map.enemies || []).filter(function(p){return p.enemy_id==='enemy.training_dummy_wooden';}).map(function(p){return p.x+','+p.y;}));
    Object.keys(map).forEach(function(k){if(/_station_interact_npc_by_cell$/.test(k))Object.keys(map[k]).forEach(function(c){facilities.add(c);});});
    var entities={};(map.entities||[]).forEach(function(e){entities[e.x+','+e.y]=e.entity_id;});
    var value={blocked:blocked,disabled:disabled,facilities:facilities,trainingDummies:trainingDummies,entities:entities}; geometry.set(map,value); return value;
  }
  function disabled(map,x,y){return x<0||y<0||x>=map.width||y>=map.height||info(map).disabled.has(x+','+y);}
  function structure(map,x,y) {
    if(disabled(map,x,y))return false;
    var g=info(map),key=x+','+y;
    if(map.map_id===config.outdoor)return g.blocked.has(key)&&x>=2&&x<=9&&y<=4;
    return g.blocked.has(key)&&!g.facilities.has(key);
  }
  function open(map,x,y){return !disabled(map,x,y)&&!structure(map,x,y);}
  function inRects(rects,x,y){return rects.some(function(r){return x>=r[0]&&y>=r[1]&&x<=r[2]&&y<=r[3];});}
  function materialAt(map,x,y,m) {
    if(m&&m.portal)return 9;
    if(map.map_id===config.outdoor){
      if(structure(map,x,y))return 10;
      if((map.entities||[]).some(function(e){return e.x===x&&e.y===y&&e.entity_id==='fishing_pond';}))return 16;
      if(inRects(config.yard.paths,x,y))return 15;
      if(inRects(config.yard.beds,x,y))return 17;
      if(inRects(config.yard.lawns,x,y))return 14;
      return 13;
    }
    if(structure(map,x,y))return 1;
    var material=0;
    config.patchZones.forEach(function(r){if(x>=r[0]&&y>=r[1]&&x<=r[2]&&y<=r[3])material=1;});
    config.indoorZones.forEach(function(zone){var r=zone.rect;if(x>=r[0]&&y>=r[1]&&x<=r[2]&&y<=r[3])material=zone.material;});
    return material;
  }
  function polygon(ctx,pts){ctx.beginPath();pts.forEach(function(p,i){if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.closePath();}
  function line(ctx,a,b,color,width){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  function texture(ctx,pts,index,alpha,quarterTurn) {
    var image=index===16?cache.yardPond:index>=10?cache.yardMaterials:index===9?cache.transition:index===0&&cache.concrete?cache.concrete:cache.materials;if(!image)return;
    var single=image===cache.concrete||image===cache.transition||image===cache.yardPond;
    var tileIndex=index===17?3:index>=10?index-10:index;
    var cw=image.naturalWidth/(single?1:3),ch=image.naturalHeight/(single?1:image===cache.yardMaterials?2:3),sx=single?0:(tileIndex%3)*cw,sy=single?0:Math.floor(tileIndex/3)*ch;
    var inset=image===cache.yardMaterials?7:2;
    ctx.save();polygon(ctx,pts);ctx.clip();
    ctx.transform((pts[1].x-pts[0].x)/256,(pts[1].y-pts[0].y)/256,(pts[3].x-pts[0].x)/256,(pts[3].y-pts[0].y)/256,pts[0].x,pts[0].y);
    if(quarterTurn){ctx.translate(128,128);ctx.rotate(quarterTurn*Math.PI/2);ctx.translate(-128,-128);}
    ctx.globalAlpha=alpha==null?1:alpha;ctx.drawImage(image,sx+inset,sy+inset,cw-inset*2,ch-inset*2,0,0,256,256);ctx.restore();
  }
  function planePoint(p,u,v){return{x:p[0].x+(p[1].x-p[0].x)*u+(p[3].x-p[0].x)*v,y:p[0].y+(p[1].y-p[0].y)*u+(p[3].y-p[0].y)*v};}
  function floor(ctx,map,x,y,m,p) {
    if(!supports(map))return false;
    if(disabled(map,x,y))return true;
    var pts=p.cellPolygon(x,y),mat=materialAt(map,x,y,m),wall=structure(map,x,y);
    var colors=['#8c8b78','#8c8b78','#474b48','#b9b8a1','#8a6642','#484a3f','#787e72','#70694d','#8d8f79','#666344','#66705c','#b6aa87','#b6aa87','#9a8968','#72794a','#929786','#6e826b','#776346'];
    polygon(ctx,pts);ctx.fillStyle=colors[mat];ctx.fill();
    if(mat===1&&!wall)texture(ctx,pts,0,1,0);
    // A roof is raised scenery, never a second roof painted at ground level.
    texture(ctx,pts,wall&&map.map_id===config.outdoor?0:mat,wall?.38:mat===1?.28:mat===13?.38:mat===14?.48:1,0);
    if(wall){polygon(ctx,pts);ctx.fillStyle='rgba(14,20,19,.45)';ctx.fill();}
    // One continuous surface; only narrow joints, never per-cell slab sides.
    polygon(ctx,pts);ctx.strokeStyle=wall?'rgba(21,28,25,.18)':'rgba(23,29,25,.26)';ctx.lineWidth=.7;ctx.stroke();
    if(!wall){line(ctx,pts[0],pts[1],'rgba(234,224,190,.17)',.65);line(ctx,pts[0],pts[3],'rgba(234,224,190,.12)',.65);}
    if(map.map_id===config.indoor&&!wall){
      var warmth=0;config.lights.forEach(function(l){var d=Math.hypot(x-l.x,y-l.y);warmth=Math.max(warmth,Math.max(0,1-d/3.2)*.14);});
      if(warmth){polygon(ctx,pts);ctx.fillStyle='rgba(250,198,105,'+warmth+')';ctx.fill();}
      if(mat===3&&x===14&&y===13){
        var a=planePoint(pts,.1,.08),b=planePoint(pts,.85,.08);line(ctx,a,b,'#343c38',4);
        for(var j=0;j<8;j++)line(ctx,planePoint(pts,.1+j*.1,.05),planePoint(pts,.1+j*.1,.12),'#868f82',1);
      }
    }
    if(map.map_id===config.outdoor){
      if(mat===17){
        polygon(ctx,pts);ctx.fillStyle='rgba(67,56,31,.28)';ctx.fill();
        for(var n=0;n<3;n++){
          line(ctx,planePoint(pts,.16+n*.3,0),planePoint(pts,.16+n*.3,1),'rgba(58,48,27,.28)',3);
          line(ctx,planePoint(pts,.2+n*.3,0),planePoint(pts,.2+n*.3,1),'rgba(222,192,134,.17)',1.1);
        }
      }
      // Low edging follows whole beds and the main path, never individual random tiles.
      if(mat===15||mat===17){
        [[0,-1,0,1],[1,0,1,2],[0,1,2,3],[-1,0,3,0]].forEach(function(e){
          var nx=x+e[0],ny=y+e[1];if(disabled(map,nx,ny)||structure(map,nx,ny))return;
          if(materialAt(map,nx,ny,{})===mat)return;
          line(ctx,pts[e[2]],pts[e[3]],mat===17?'#71694d':'#a7a489',2.4);
        });
      }
    }
    return true;
  }
  function height(map,x,y,p){
    if(!structure(map,x,y))return 0;
    if(map.map_id===config.outdoor)return p.tileHeight*.48;
    if(open(map,x+1,y)||open(map,x,y+1))return p.tileHeight*.6;
    if(open(map,x-1,y)||open(map,x,y-1))return p.tileHeight*.13;
    return 0;
  }
  function fitting(ctx,face,kind,size) {
    var image=cache.fittings;if(!image)return;
    var crop=config.fittingRects[kind],cw=crop[2],ch=crop[3],wf=[.28,.28,.4,.75][kind],hf=[.7,.7,.6,.42][kind];
    var top=.18;
    if(size){
      // Source art has its own proportions. Wall height must not stretch it.
      var faceHeight=Math.abs(face[3].y-face[0].y),faceWidth=Math.abs(face[1].x-face[0].x);
      hf=size.height/faceHeight;wf=size.height*cw/ch/faceWidth;top=size.top;
    }
    var a=planePoint(face,(1-wf)/2,top),b=planePoint(face,(1+wf)/2,top),d=planePoint(face,(1-wf)/2,top+hf);
    ctx.save();ctx.transform((b.x-a.x)/cw,(b.y-a.y)/cw,(d.x-a.x)/ch,(d.y-a.y)/ch,a.x,a.y);
    ctx.drawImage(image,crop[0],crop[1],cw,ch,0,0,cw,ch);ctx.restore();
  }
  // Raised plaster owns its click surface, without a hover label or cursor.
  function pickInspectableWall(map,p,metaAt,px,py){
    if(!supports(map)||!p.isIsometric)return null;
    function contains(pts){
      var inside=false;
      for(var i=0,j=pts.length-1;i<pts.length;j=i++){
        var a=pts[i],b=pts[j];
        if((a.y>py)!==(b.y>py)&&px<(b.x-a.x)*(py-a.y)/(b.y-a.y)+a.x)inside=!inside;
      }
      return inside;
    }
    var keys=Object.keys(map.inspectable_walls||{}).sort(function(a,b){var aa=a.split(',').map(Number),bb=b.split(',').map(Number);return bb[0]+bb[1]-aa[0]-aa[1];});
    for(var key of keys){
      var xy=key.split(',').map(Number),x=xy[0],y=xy[1],m=metaAt(x,y),h=height(map,x,y,p);
      if(!h||!m.terrainVisible)continue;
      var pts=p.cellPolygon(x,y),top=pts.map(function(q){return{x:q.x,y:q.y-h};});
      var surfaces=[top];
      [[1,2,1,0],[2,3,0,1]].forEach(function(f){
        var nh=height(map,x+f[2],y+f[3],p);
        if(nh<h)surfaces.push([top[f[0]],top[f[1]],{x:pts[f[1]].x,y:pts[f[1]].y-nh},{x:pts[f[0]].x,y:pts[f[0]].y-nh}]);
      });
      if(surfaces.some(contains))return{x:x,y:y};
    }
    return null;
  }
  function wall(ctx,map,x,y,m,p,skipBuilding) {
    if(!supports(map)||!p.isIsometric)return;
    if(map.map_id===config.outdoor){
      if(m.terrainVisible){cellEdge(ctx,map,x,y,p);yardFence(ctx,map,x,y,p);}
      if(!skipBuilding&&buildingShown(m))yardBuilding(ctx,map,x,y,m,p);
      return;
    }
    if(!m.terrainVisible)return;
    cellEdge(ctx,map,x,y,p);
    var h=height(map,x,y,p);if(!h)return;
    var pts=p.cellPolygon(x,y),top=pts.map(function(pt){return{x:pt.x,y:pt.y-h};});
    var faces=[{side:'east',a:1,b:2,nx:x+1,ny:y},{side:'south',a:2,b:3,nx:x,ny:y+1}];
    faces.forEach(function(f){
      var nh=height(map,f.nx,f.ny,p);if(nh>=h)return;
      var q=[top[f.a],top[f.b],{x:pts[f.b].x,y:pts[f.b].y-nh},{x:pts[f.a].x,y:pts[f.a].y-nh}];
      polygon(ctx,q);ctx.fillStyle=f.side==='east'?'#596354':'#69715e';ctx.fill();texture(ctx,q,8,.64,0);
      polygon(ctx,q);ctx.fillStyle=f.side==='east'?'rgba(15,25,22,.23)':'rgba(15,25,22,.07)';ctx.fill();ctx.strokeStyle='#343c33';ctx.lineWidth=1.4;ctx.stroke();
      var inspection=map.inspectable_walls&&map.inspectable_walls[x+','+y];
      if(inspection){
        polygon(ctx,q);ctx.fillStyle='rgba(178,169,139,.09)';ctx.fill();
        line(ctx,planePoint(q,.16,.19),planePoint(q,.16,.86),'rgba(43,48,39,.28)',.8*p.tileWidth/144);
        line(ctx,planePoint(q,.18,.2),planePoint(q,.18,.85),'rgba(202,193,160,.18)',.7*p.tileWidth/144);
      }
      var footA=planePoint(q,0,.91),footB=planePoint(q,1,.91);line(ctx,footA,footB,'#363e34',4);
      if(h>p.tileHeight*.3){
        config.lights.forEach(function(l){if(l.x===x&&l.y===y&&l.side===f.side)fitting(ctx,q,0);});
        if(!inspection)config.fittings.forEach(function(l){if(l.x===x&&l.y===y&&l.side===f.side)fitting(ctx,q,l.kind);});
        line(ctx,planePoint(q,0,.12),planePoint(q,1,.12),'#414a3c',2.6);
        line(ctx,planePoint(q,0,.1),planePoint(q,1,.1),'#96977c',.8);
      }
    });
    polygon(ctx,top);ctx.fillStyle='#6b7162';ctx.fill();texture(ctx,top,0,.5,0);
    line(ctx,top[1],top[2],'#313b32',1.7);line(ctx,top[2],top[3],'#303930',1.7);
    line(ctx,top[0],top[1],'rgba(220,214,180,.45)',1.2);
  }
  function drawProp(ctx,kind,c,p,width) {
    var image=cache.props;if(!image)return false;
    var crop=config.propRects&&config.propRects[kind];
    if(!crop){var cw=image.naturalWidth/3;crop=[kind*cw,0,cw,image.naturalHeight];}
    var scale=width*(p.tileWidth/144)/crop[2],w=crop[2]*scale,h=crop[3]*scale;
    ctx.save();ctx.fillStyle='rgba(12,19,14,.24)';ctx.beginPath();ctx.ellipse(c.x+3,c.y+2,w*.38,w*.13,0,0,Math.PI*2);ctx.fill();
    ctx.drawImage(image,crop[0],crop[1],crop[2],crop[3],c.x-w/2,c.y-h+4,w,h);ctx.restore();return true;
  }
  function object(ctx,map,x,y,m,p,skipBuilding) {
    if(!supports(map)||!p.isIsometric||(!m.sceneryVisible&&!m.buildingVisible))return false;
    // Identifying a fixed practice target reveals its shape even outside the detail/name radius.
    if(m.sceneryVisible&&m.enemy&&(m.enemyId==='enemy.training_dummy_wooden'||info(map).trainingDummies.has(x+','+y)))return drawProp(ctx,2,p.cellCenter(x,y),p,42);
    if(map.map_id===config.indoor){var spec=config.props[x+','+y];if(spec)drawProp(ctx,spec.kind,p.cellCenter(x,y),p,spec.width);}
    if(map.map_id===config.outdoor&&!skipBuilding)yardObject(ctx,map,x,y,m,p);
    return false;
  }
  function roofZ(y,p){return p.tileHeight*(config.yard.roofBase+(4-y)*config.yard.roofSlope);}
  function inFrontOfPlayer(map,x,y,p,player){
    return !!(supports(map)&&map.map_id===config.outdoor&&p.isIsometric&&player&&
      structure(map,x,y)&&p.cellCenter(x,y).y>p.cellCenter(player.x,player.y).y+.01);
  }
  function foreground(ctx,map,x,y,m,p,player){
    if(!inFrontOfPlayer(map,x,y,p,player)||!buildingShown(m))return;
    yardBuilding(ctx,map,x,y,m,p);
    yardObject(ctx,map,x,y,m,p);
  }
  function revealPlayer(ctx,map,p,player){
    if(!supports(map)||map.map_id!==config.outdoor||!p.isIsometric||!player)return;
    // Erase only foreground architecture. Ground, fog and pawn remain untouched.
    // The fully clear centre includes the pawn's ground tile; the edge feathers out.
    var c=p.cellCenter(player.x,player.y),s=config.yard.cutaway;
    ctx.save();ctx.translate(c.x,c.y-p.tileHeight*s.lift);ctx.scale(p.tileWidth*s.width,p.tileHeight*s.height);
    var fade=ctx.createRadialGradient(0,0,s.clearRadius,0,0,1);fade.addColorStop(0,'rgba(0,0,0,1)');fade.addColorStop(1,'rgba(0,0,0,0)');
    ctx.globalCompositeOperation='destination-out';ctx.fillStyle=fade;ctx.fillRect(-1,-1,2,2);ctx.restore();
  }
  function yardBuilding(ctx,map,x,y,m,p){
    if(!structure(map,x,y))return;
    var pts=p.cellPolygon(x,y),ys=[y-.5,y-.5,y+.5,y+.5];
    var top=pts.map(function(pt,i){return{x:pt.x,y:pt.y-roofZ(ys[i],p)};});
    [{side:'east',a:1,b:2,nx:x+1,ny:y},{side:'south',a:3,b:2,nx:x,ny:y+1}].forEach(function(f){
      if(structure(map,f.nx,f.ny))return;
      var face=[top[f.a],top[f.b],pts[f.b],pts[f.a]],key=x+','+y+','+f.side;
      polygon(ctx,face);ctx.fillStyle='#a9a487';ctx.fill();texture(ctx,face,config.yard.windows.includes(key)?12:11,1,0);
      if(f.side==='east'){polygon(ctx,face);ctx.fillStyle='rgba(29,42,29,.16)';ctx.fill();}
      line(ctx,pts[f.a],pts[f.b],'#434c3a',3);
      if(key===config.yard.door){
        var door=[planePoint(face,.18,.19),planePoint(face,.82,.19),planePoint(face,.82,1),planePoint(face,.18,1)];
        polygon(ctx,door);ctx.fillStyle='#202b24';ctx.fill();ctx.strokeStyle='#625e45';ctx.lineWidth=5;ctx.stroke();
        line(ctx,door[0],door[1],'#b4a47a',2.4);
      }
      if(config.yard.lamps.includes(key))fitting(ctx,face,0,{height:config.yard.lampSize.height*p.tileWidth/144,top:config.yard.lampSize.top});
      line(ctx,top[f.a],top[f.b],'#303b32',5);
      line(ctx,{x:top[f.a].x,y:top[f.a].y+5},{x:top[f.b].x,y:top[f.b].y+5},'#aeac89',1.3);
    });
    polygon(ctx,top);ctx.fillStyle='#65705b';ctx.fill();texture(ctx,top,10,1,0);
    [[0,-1,0,1],[1,0,1,2],[0,1,2,3],[-1,0,3,0]].forEach(function(e){
      if(!structure(map,x+e[0],y+e[1])){line(ctx,top[e[2]],top[e[3]],'#303b32',2.4);}
    });
  }
  function yardSprite(ctx,kind,c,p,width,shadow,spec){
    var image=cache.yardProps,crop=config.yard.propRects[kind];if(!image||!crop)return;
    var w=width*p.tileWidth/144,h=w*crop[3]/crop[2],scale=w/crop[2];
    var anchor=spec&&spec.anchor,left=anchor?c.x-(anchor[0]-crop[0])*scale:c.x-w/2,top=anchor?c.y-(anchor[1]-crop[1])*scale:c.y-h+2;
    ctx.save();if(shadow){
      if(spec&&spec.feet)polygon(ctx,spec.feet.map(function(pt){return{x:left+(pt[0]-crop[0])*scale+1,y:top+(pt[1]-crop[1])*scale+1};}));
      else {ctx.beginPath();ctx.ellipse(c.x+3,c.y+1,w*.32,w*.1,0,0,Math.PI*2);}
      ctx.fillStyle='rgba(29,36,21,.23)';ctx.fill();
    }
    ctx.drawImage(image,crop[0],crop[1],crop[2],crop[3],left,top,w,h);ctx.restore();
  }
  function yardObject(ctx,map,x,y,m,p){
    var key=x+','+y,c=p.cellCenter(x,y),yard=config.yard;
    if(m.sceneryVisible&&yard.trees.includes(key)&&info(map).blocked.has(key))yardSprite(ctx,0,c,p,108,true);
    if(buildingShown(m)&&yard.roofVents.includes(key)&&structure(map,x,y))yardSprite(ctx,3,{x:c.x,y:c.y-roofZ(y,p)},p,52,true);
    // Solid props own a ground cell; never attach them to a building face.
    var spec=yard.storage[key];if(m.sceneryVisible&&spec&&info(map).blocked.has(key)&&!structure(map,x,y))yardSprite(ctx,spec.kind,c,p,spec.width,true,spec);
    var entity=info(map).entities[key],crop=yard.plantRects[entity==='gathering_bush'?1:0];
    if(m.sceneryVisible&&m.gathering&&cache.yardPlants&&crop&&(entity==='gathering_grass'||entity==='gathering_bush')){
      var w=(entity==='gathering_bush'?34:23)*p.tileWidth/144,h=w*crop[3]/crop[2];
      ctx.drawImage(cache.yardPlants,crop[0],crop[1],crop[2],crop[3],c.x-w/2,c.y-h+2,w,h);
    }
  }
  function yardFence(ctx,map,x,y,p){
    var f=config.yard.fence,ps=p.cellPolygon(x,y),edges=[];
    if(x===0&&y>=f.westStart)edges.push([0,3]);
    if(x===map.width-1&&y>=f.eastStart)edges.push([1,2]);
    if(y===map.height-1&&(x<f.exit[0]||x>f.exit[1]))edges.push([3,2]);
    edges.forEach(function(e){
      var a=ps[e[0]],b=ps[e[1]],h=p.tileHeight*f.height,t=p.tileHeight*.042;
      [.35,.78].forEach(function(r){
        var q=[{x:a.x,y:a.y-h*r},{x:b.x,y:b.y-h*r},{x:b.x,y:b.y-h*r+t},{x:a.x,y:a.y-h*r+t}];
        polygon(ctx,q);ctx.fillStyle='#8c7147';ctx.fill();texture(ctx,q,4,.8,1);ctx.strokeStyle='#4d4c32';ctx.lineWidth=.7;ctx.stroke();
      });
      [a,b].forEach(function(q){var w=p.tileWidth*.024;ctx.fillStyle='#8a7049';ctx.strokeStyle='#42462f';ctx.lineWidth=.9;ctx.fillRect(q.x-w/2,q.y-h,w,h);ctx.strokeRect(q.x-w/2,q.y-h,w,h);line(ctx,{x:q.x-w/2+1,y:q.y-h+1},{x:q.x-w/2+1,y:q.y},'#b19b6c',.7);});
    });
  }
  function cellEdge(ctx,map,x,y,p){
    if(disabled(map,x,y))return;
    var depth=12*(p.tileWidth/144);
      var pts=p.cellPolygon(x,y);
      [[x+1,y,1,2,'#353f35'],[x,y+1,2,3,'#49503e']].forEach(function(e){
        if(!disabled(map,e[0],e[1]))return;var a=pts[e[2]],b=pts[e[3]];
        polygon(ctx,[a,b,{x:b.x,y:b.y+depth},{x:a.x,y:a.y+depth}]);ctx.fillStyle=e[4];ctx.fill();line(ctx,a,b,'#a5a38a',1);
      });
  }
  function edge(){ /* Visible outer faces are drawn per cell on the visibility-gated layer. */ }
  global.BaseHideoutArt={config:config,supports:supports,usesGroundVisibility:usesGroundVisibility,visibleBuildingCells:visibleBuildingCells,load:load,floor:floor,wall:wall,object:object,edge:edge,materialAt:materialAt,isDisabled:disabled,isStructure:structure,inFrontOfPlayer:inFrontOfPlayer,foreground:foreground,revealPlayer:revealPlayer,pickInspectableWall:pickInspectableWall};
})(typeof window!=='undefined'?window:globalThis);
