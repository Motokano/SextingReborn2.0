// Art-review composition only. Positions are not runtime occupancy or triggers.
export function drawLivedInRoom({c,images,manifest,props,additions,boss,mat,rack,loot,light,guides,modernRoom=false,fan,
  sprite,container,polygon,texture,label}) {
  const W=7,H=8,step=144/Math.SQRT2/2;
  const P=(x,y,z=0)=>[680+(x-y)*72,200+(x+y)*step-z];
  const quad=(x0,y0,x1,y1,z=0)=>[P(x0,y0,z),P(x1,y0,z),P(x1,y1,z),P(x0,y1,z)];
  const floor=images.get(manifest.reuse.floor),wall=images.get(manifest.reuse.wall);
  const timber=images.get('assets/dungeon/outpost-decor-v1/floor-timber.png');
  c.clearRect(0,0,1360,1150);c.fillStyle=light?'#d9d2c2':'#202822';c.fillRect(0,0,1360,1150);
  c.save();c.translate(-70,-22);c.scale(1.12,1.12);

  // One inhabited rear strip, opening onto the existing clear combat floor.
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const q=quad(x-.5,y-.5,x+.5,y+.5);
    texture(c,floor,q,(x%4)*floor.width/4,(y%4)*floor.height/4,floor.width/4,floor.height/4);
    polygon(c,q,'#3e342018',guides?'#efdf9b60':null);
  }
  const timberArea=quad(-.5,-.5,6.5,1.45);
  const sleepFloor=quad(-.5,1.45,.75,3.2);
  if(modernRoom){
    // The old workplace retains worn floor paint, not a new timber stage.
    polygon(c,timberArea,'#68777744','#888f7938');
    polygon(c,sleepFloor,'#68777738');
    c.save();c.strokeStyle='#ddd5b547';c.lineWidth=2;c.setLineDash([23,8]);
    c.beginPath();c.moveTo(...P(.8,1.45));c.lineTo(...P(6.3,1.45));c.stroke();c.restore();
  }else{
    texture(c,timber,timberArea,0,0,timber.width,timber.height);
    polygon(c,timberArea,'#2c281b28','#332c2670');
    texture(c,timber,sleepFloor,0,0,timber.width,timber.height);
    polygon(c,sleepFloor,'#2c281b28');
  }
  if(guides){
    for(let y=0;y<H;y++)for(let x=0;x<W;x++)polygon(c,quad(x-.5,y-.5,x+.5,y+.5),null,'#f3e0ad55');
    polygon(c,quad(.5,1.5,5.5,6.5),'#d4cf7020','#ded29190');
  }

  function groundOval(x,y,rx,ry,color){
    const [sx,sy]=P(x,y);c.save();c.translate(sx,sy);c.scale(1,Math.SQRT1_2);
    c.fillStyle=color;c.beginPath();c.ellipse(0,0,rx,ry,0,0,Math.PI*2);c.fill();c.restore();
  }
  // Wear belongs to specific actions: passage, bench movement, drinks, washing.
  let seed=97;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<62;i++){
    const y=2.1+rand()*5.5,x=3+(rand()-.5)*.7;
    groundOval(x,y,2+rand()*4,1+rand()*2,'#c8ba9b10');
  }
  for(const [x,y] of [[2.6,1.55],[3.3,1.4],[5.7,.85],[5.8,1.15]]){
    groundOval(x,y,9,4,'#302c2440');groundOval(x+.04,y,5,2,'#2a271d22');
  }
  c.save();c.strokeStyle='#d0b79050';c.lineWidth=1.1;
  for(let i=0;i<6;i++){
    const x=2.15+i*.22,a=P(x,1.37),b=P(x+.04,1.61);c.beginPath();c.moveTo(...a);c.lineTo(...b);c.stroke();
  }c.restore();

  function wallStrip(a,b,height){
    const A=P(...a),B=P(...b),q=[[A[0],A[1]-height],[B[0],B[1]-height],B,A];
    texture(c,wall,q,0,0,wall.width,wall.height);polygon(c,q,'#392b1715','#45493b');
    // Wall caps and a worn timber skirting give the room a continuous enclosure.
    polygon(c,[[A[0],A[1]-height],[B[0],B[1]-height],[B[0],B[1]-height+5],[A[0],A[1]-height+5]],modernRoom?'#586160':'#57523b');
    polygon(c,[[A[0],A[1]-8],[B[0],B[1]-8],B,A],modernRoom?'#414b49':'#484032');
  }
  wallStrip([-.5,-.5],[6.5,-.5],96);wallStrip([-.5,-.5],[-.5,7.5],96);
  wallStrip([6.5,-.5],[6.5,7.5],16);
  wallStrip([-.5,7.5],[2.5,7.5],16);wallStrip([3.5,7.5],[6.5,7.5],16);

  // A small window is wall geometry, projected once onto the same back wall.
  const windowQuad=(a,b,lo,hi)=>[P(a,-.5,hi),P(b,-.5,hi),P(b,-.5,lo),P(a,-.5,lo)];
  polygon(c,windowQuad(4.8,6.05,24,82),modernRoom?'#7c8580':'#342f27','#343d39');
  polygon(c,windowQuad(4.88,5.97,29,77),'#778378','#968a6b');
  polygon(c,windowQuad(5.39,5.47,28,79),modernRoom?'#5c6763':'#514732');
  polygon(c,windowQuad(4.86,5.99,51,55),modernRoom?'#5c6763':'#514732');
  polygon(c,[P(4.9,-.49),P(6,-.49),P(5.4,1.1),P(4.25,1.1)],'#c8c5a019');
  if(modernRoom){
    // Surviving workplace fittings, deliberately unlit: no claim of working mains power.
    c.save();c.strokeStyle='#303b38';c.lineWidth=5;c.lineJoin='round';
    const conduit=[P(1.3,-.5,76),P(3.85,-.5,76),P(3.85,-.5,45)];
    c.beginPath();conduit.forEach((q,i)=>c[i?'lineTo':'moveTo'](...q));c.stroke();
    c.strokeStyle='#89928a';c.lineWidth=2;c.stroke();c.restore();
    polygon(c,windowQuad(3.71,3.98,33,51),'#737f75','#34443c');
    polygon(c,windowQuad(2.01,3.13,72,85),'#414a48','#2c3631');
    polygon(c,windowQuad(2.08,3.06,75,81),'#a3aaa0');
    // Small faded duty-room sign, rendered on the wall plane like the territory plaque.
    const sign=document.createElement('canvas');sign.width=200;sign.height=72;
    const sc=sign.getContext('2d');sc.fillStyle='#5d7069';sc.fillRect(0,0,200,72);
    sc.strokeStyle='#b0b4a2';sc.lineWidth=4;sc.strokeRect(5,5,190,62);
    sc.fillStyle='#c8c8b5';sc.font='bold 44px Microsoft YaHei,sans-serif';sc.textAlign='center';sc.fillText('值班室',100,53);
    c.save();c.globalAlpha=.67;texture(c,sign,windowQuad(.35,1.02,52,77),0,0,200,72);c.restore();
  }

  // Keep the approved pawn and container dimensions intact; only assemble scenery.
  sprite(c,{...mat,width:modernRoom?260:300},...P(3,3.1),{shadow:false});
  const table=additions.find(p=>p.id==='dining'),sleep=additions.find(p=>p.id==='sleeping'),sideboard=additions.find(p=>p.id==='sideboard');
  const chair=modernRoom?additions.find(p=>p.id==='chair'):props[1];
  const cargo=modernRoom?additions.find(p=>p.id==='cargo'):props[2];
  const objects=[
    {p:sleep,x:.13,y:1.05,flip:true},
    {loot:loot[0],x:.12,y:2.24},
    {p:chair,x:1.95,y:.48,flip:true},
    {p:table,x:3,y:.7},
    {p:sideboard,x:5.1,y:.48},
    {p:boss,x:3.15,y:2.05},
    {p:cargo,x:.03,y:5.75,flip:true},
    {loot:loot[1],x:.12,y:6.95},
    ...(!modernRoom?[{p:rack,x:.03,y:4.57,flip:true}]:[{p:fan,x:6.1,y:.55}])
  ];
  // Subtle lamp pool remains local to the serving corner.
  const [lx,ly]=P(4.9,.55);c.save();c.translate(lx,ly);c.scale(1,.7);
  const glow=c.createRadialGradient(0,0,1,0,0,120);glow.addColorStop(0,'#e4b85c20');glow.addColorStop(1,'#e4b85c00');
  c.fillStyle=glow;c.fillRect(-120,-120,240,240);c.restore();
  objects.sort((a,b)=>(a.x+a.y)-(b.x+b.y));
  for(const o of objects){const pos=P(o.x,o.y);if(o.loot)container(c,o.loot,...pos);else sprite(c,o.p,...pos,{flip:o.flip});}

  // Entry remains visibly open. The old iron door leaf sits swung to one side.
  wallStrip([1.7,7.5],[2.5,7.5],70);
  const atlas=images.get('assets/dungeon/modules-v1/material-atlas-v1.png');
  const door=[P(2.5,7.5,62),P(2.5,8.36,62),P(2.5,8.36),P(2.5,7.5)];
  texture(c,atlas,door,atlas.width*2/3,atlas.height/2,atlas.width/3,atlas.height/2);polygon(c,door,null,'#3b3c30');
  const mark=props[3];texture(c,images.get(mark.src),[P(1.96,7.5,51),P(2.33,7.5,51),P(2.33,7.5,34),P(1.96,7.5,34)],...mark.crop);
  label(c,'入口 · 可绕行，也可退出',...P(3.35,8.2),15);
  c.restore();
  label(c,modernRoom?'旧厂房值班室  ·  被地头蛇占用的日常空间':'里侧收账吃喝  ·  帘后休息  ·  门边理货',680,1085,19);
  label(c,modernRoom?'钢架桌、塑料凳、铁床与旧皮椅；只亮着一盏小电池灯':'桌边磨痕、未收的碗盘与外衣，让房间保留使用中的痕迹',680,1117,14);
}
