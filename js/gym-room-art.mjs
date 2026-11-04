// Room materials are projected onto architecture; prop originals only translate
// and scale uniformly, with their ground shadows rendered separately.
export async function loadGymRoomArt(){
  const root='assets/map/isometric/gym-room-v1/';
  const manifest=await fetch(root+'manifest.json').then(r=>{if(!r.ok)throw Error('房间素材加载失败');return r.json();});
  const entries=new Map(await Promise.all(manifest.assets.map(async a=>{
    const im=new Image();im.src=a.file;await im.decode();
    const shadow=a.groundContacts?TileRendererV2.makeGroundShadow(im,{...a,width:a.crop[2]*a.scaleAt144,source:a.file},[10,5]):null;
    return [a.id,{...a,im,shadow}];
  })));
  const polygon=(ctx,pts)=>{ctx.beginPath();pts.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](p.x,p.y));ctx.closePath();};
  function surface(ctx,pts,im,sx=0,sy=0,sw=im.width,sh=im.height){
    ctx.save();polygon(ctx,pts);ctx.clip();
    ctx.transform((pts[1].x-pts[0].x)/sw,(pts[1].y-pts[0].y)/sw,(pts[3].x-pts[0].x)/sh,(pts[3].y-pts[0].y)/sh,pts[0].x,pts[0].y);
    ctx.drawImage(im,sx,sy,sw,sh,0,0,sw,sh);ctx.restore();
  }
  function install(map,layout){
    const previousFloor=BaseHideoutArt.floor,previousWall=BaseHideoutArt.wall;
    const [x0,y0,x1,y1]=layout.selectedBounds,within=(x,y)=>x>=x0&&x<=x1&&y>=y0&&y<=y1;
    const walls=new Set(map.blocks.map(p=>p.x+','+p.y));
    const height=(x,y)=>within(x,y)&&walls.has(x+','+y)?(x===x0||y===y0?138:13):0;
    BaseHideoutArt.floor=function(ctx,m,x,y,meta,p){
      if(m.map_id!==map.map_id||!within(x,y))return previousFloor.apply(this,arguments);
      const pts=p.cellPolygon(x,y),im=entries.get('floor_material').im;
      previousFloor.apply(this,arguments);
      const rubber=(layout.rubberZones||[]).some(([ax,ay,bx,by])=>x>=ax&&x<=bx&&y>=ay&&y<=by);
      if(!walls.has(x+','+y)&&rubber){
        surface(ctx,pts,im,(x%4)*im.width/4,(y%4)*im.height/4,im.width/4,im.height/4);
        polygon(ctx,pts);ctx.fillStyle='rgba(131,123,90,.10)';ctx.fill();
      }else if(!walls.has(x+','+y)){
        polygon(ctx,pts);ctx.fillStyle='rgba(42,43,31,.17)';ctx.fill();
      }
      return true;
    };
    BaseHideoutArt.wall=function(ctx,m,x,y,meta,p){
      if(m.map_id!==map.map_id||!within(x,y))return previousWall.apply(this,arguments);
      if(!p.isIsometric)return previousWall.apply(this,arguments);
      const unit=p.tileWidth/144,h=height(x,y)*unit;if(!h||!meta.terrainVisible)return;
      const pts=p.cellPolygon(x,y),top=pts.map(q=>({x:q.x,y:q.y-h})),im=entries.get('wall_material').im;
      for(const [a,b,dx,dy]of [[1,2,1,0],[2,3,0,1]]){
        const nh=height(x+dx,y+dy)*unit;if(nh>=h)continue;
        const q=[top[a],top[b],{x:pts[b].x,y:pts[b].y-nh},{x:pts[a].x,y:pts[a].y-nh}];
        surface(ctx,q,im,((x+y)%4)*im.width/4,0,im.width/4,im.height);
        polygon(ctx,q);ctx.fillStyle=a===1?'#131b142b':'#d1b16c0c';ctx.fill();
        ctx.beginPath();ctx.moveTo(pts[a].x,pts[a].y-nh-3);ctx.lineTo(pts[b].x,pts[b].y-nh-3);ctx.strokeStyle='#363b2d';ctx.lineWidth=5;ctx.stroke();
      }
      polygon(ctx,top);ctx.fillStyle='#656451';ctx.fill();ctx.strokeStyle='#363d30';ctx.lineWidth=1.2;ctx.stroke();
    };
  }
  function sprite(ctx,id,x,y){
    const a=entries.get(id);if(!a)return;
    if(a.shadow)ctx.drawImage(a.shadow,x+a.shadow.drawBounds[0],y+a.shadow.drawBounds[1],a.shadow.drawBounds[2],a.shadow.drawBounds[3]);
    const [bx,by,bw,bh]=a.crop,[ax,ay]=a.anchor,f=a.scaleAt144;
    ctx.drawImage(a.im,bx,by,bw,bh,x+(bx-ax)*f,y+(by-ay)*f,bw*f,bh*f);
  }
  function fittings(ctx,project,layout){
    for(const {id,x,y,z}of layout.wallFittings||[]){
      const p=project(x,y,z);sprite(ctx,id,p.x,p.y);
    }
  }
  return {install,sprite,fittings,manifest};
}
