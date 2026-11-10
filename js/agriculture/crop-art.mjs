// Botanical artwork for the agriculture UI prototype. IDs come from the formal crop catalog.
// Each drawing is a mature identifying illustration, not a simulation of growth stages.
const P=(d,fill)=>`<path d="${d}" fill="${fill}"/>`;
const L=(d,stroke='#89945b',width=2)=>`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const E=(x,y,rx,ry,fill,angle=0)=>`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" transform="rotate(${angle} ${x} ${y})"/>`;
const C=(x,y,r,fill)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const G=(content,x=0,y=0,angle=0,scale=1)=>`<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})">${content}</g>`;
const leaf=(x,y,length,width,angle=0,color='#789650')=>G(P(`M0 0Q${-width} ${-length*.48} 0 ${-length}Q${width} ${-length*.46} 0 0`,color)+L(`M0 -2 0 ${-length*.85}`,'#b0bc77',.8),x,y,angle);
const roots=(x,y)=>L(`M${x} ${y}l-5 7m5-7 2 8m-2-8 7 5`,'#b4a37a',1);
// Small blossoms have no SVG IDs, so repeated inline drawings never share paint servers.
function bloom(x,y,color='#e0cf91',size=1){return G(Array.from({length:5},(_,i)=>G(E(0,-3,2.3,3.2,color),0,0,i*72)).join('')+C(0,0,1.8,'#bd9e50'),x,y,0,size);}
function lobed(x,y,angle=0,scale=1,color='#789650'){
  return G(P('M0 0Q-15-2-15-10q-8-7-2-12 0-8 8-6 1-10 9-7 7-6 10 3 9-2 9 5 9 5 1 12Q16-4 0 0',color)+L('M0-2 0-29M0-13l-12-8M0-18l11-8','#afbd7a',1),x,y,angle,scale);
}
const shadow='<ellipse cx="50" cy="88" rx="28" ry="6" fill="#10170d" opacity=".24"/>';
const art={};

// Grain: retain the original maize silhouette and the loose, leaning rice panicles.
art.maize=L('M49 89 47 20','#a6b66c',4)+P('M48 71Q14 68 13 44q28 1 35 27M49 57Q70 26 86 34 75 58 49 57M48 43Q21 34 23 18q22 2 25 25','#78964c')+P('M49 79Q70 73 75 56 55 58 49 79','#526f36')+E(47,44,9,22,'#d2ac52',-17)+L('m42 26 7 36m-14-29 13-3m-11 11 14-3m-12 11 14-3m-12 11 14-3','#8e6b35',1.4)+L('m46 22-7-13m7 13 5-16m-5 16 11-10','#b9a165',2);
function rice({lean=0,grain='#c5af61',width=3.3,length=6,round=false}){
  let s=L(`M35 88Q39 51 ${48+lean} 23M49 89Q50 46 ${66+lean} 22M62 88Q63 55 41 31`,'#8e9b4c',2);
  s+=P('M35 79Q5 59 17 44q15 11 18 35M52 67q21-31 32-25-15 28-32 25M45 57Q22 30 29 22q15 14 16 35','#6a8245');
  for(let side=0;side<2;side++)for(let i=0;i<6;i++){
    const x=(side?66:46)+lean-i*(round?1.8:1.1),y=(side?22:19)+i*(round?5.2:6);
    s+=E(x,y,width,length,side?'#a29552':grain,side?35:-35);
    if(!round)s+=L(`M${x} ${y-length+1}l${side?2:-2}-4`,'#c6b677',.6);
  }
  return s;
}
art.rice=rice({});
art.rice_bomba=rice({lean:3,grain:'#d6bd73',width:4.3,length:5.5,round:true});
art.rice_basmati=rice({lean:6,grain:'#d6c394',width:2.6,length:7.9});
art.rice_glutinous_round=rice({lean:-3,grain:'#e2d7a4',width:4.6,length:4.9,round:true});
function wheat(durum=false){
  let s=L('M38 88 32 37M51 89 54 30M63 88 73 44','#a3a25c',2.2)+P('M39 79Q19 70 18 50 36 58 39 79M55 71Q71 53 86 54 71 68 55 71','#819252');
  for(const [x,y,a]of [[32,39,-13],[54,32,5],[73,45,18]]){
    let ear=L('M0 3V-25','#b9974f',1.4);
    for(let i=0;i<5;i++){
      const yy=-i*5;
      ear+=E(-3.4,yy,3.8,durum?6:5, i%2?'#c9a553':'#dbc17b',-42)+E(3.4,yy,3.8,durum?6:5,'#c8ab60',42);
      if(durum)ear+=L(`M-5 ${yy-3}l-5-12M5 ${yy-3}l5-12`,'#c6b176',.8);
    }
    ear+=L(`M0-22v${durum?-13:-6}`,'#d3bf7c',1);
    s+=G(ear,x,y,a);
  }
  return s;
}
art.wheat=wheat();art.wheat_durum=wheat(true);
art.euryale=L('M51 86 48 53M49 69 68 40','#778857',2.5)+P('M13 72 17 60 25 59 29 51 40 54 48 49 56 55 68 52 71 60 83 63 82 74 75 81 63 80 55 87 44 83 34 86 28 79 18 80Z','#70874e')+E(48,69,29,12,'#80985b')+L('M48 69 21 64m27 5-8-13m8 13 21-10M48 69l24 7m-24-7-12 12','#b0b77b',1)+L('M68 46V31','#929359',2)+G(P('M0 2Q-21-5-14-15-3-12 0 2','#9c7192')+P('M0 2Q-10-21 0-25 11-18 0 2','#b191ab')+P('M0 2Q3-14 15-16 20-4 0 2','#c6a3b5')+E(0,1,8,3,'#baa46a'),68,37)+E(31,80,9,7,'#877650')+L('m24 76-3-3m8 0-1-4m7 6 3-2m-12 6-4 1','#ad9a69',1.4);

// Fruiting vegetables: stems, leaves and hanging fruit are composed independently.
function vineLeaves(){return L('M48 88Q53 61 47 25M49 63 24 45M49 53 73 30','#8d9a5c',3)+leaf(48,73,37,14,-66)+leaf(50,60,34,13,62,'#627f45')+lobed(48,43,-52,.68)+lobed(52,37,48,.66,'#78934e')+leaf(47,27,22,11,8);}
function tomato(green=false){const c=green?'#a3ae61':'#bf6750',dark=green?'#82954e':'#a84d40';return vineLeaves()+L('M30 43 30 58M64 36 67 51M52 63 56 71','#8c9855',1.8)+[[30,64,12],[67,57,10],[56,77,9]].map(([x,y,r])=>C(x,y,r,dark)+E(x-2,y-1,r*.79,r*.87,c)+P(`M${x} ${y-r+2}l-8-4 6 0 1-5 3 4 6-1-4 5Z`,'#5f7b46')+L(`M${x-5} ${y-4}l3-2`,green?'#cbd28c':'#e29a76',2)).join('');}
art.tomato=tomato();art.tomato_green=tomato(true);
art.cucumber=L('M47 88Q38 65 53 42T50 14M46 63 25 44M53 42 74 30','#92a064',2.5)+lobed(44,62,-60,.9,'#5c7c46')+lobed(54,43,45,.87)+lobed(50,26,-20,.63)+L('M51 36q-12-18-19-8t7 4M50 71q24-8 28 1t-7 2','#9ba96a',1)+G(P('M0 0C-11 0-14 30-7 37 2 44 10 26 8 8Q6 1 0 0','#7e9b56')+L('M-2 5q-7 15-4 26','#b2c07a',2)+L('M3 9 3 12M0 20v3M-4 29v2','#506f3e',1.3),31,43,-15)+G(P('M0 0C-8 1-11 21-6 29 4 34 9 15 7 5Z','#637f40')+L('M-2 6-4 22','#a4b571',1.6),72,35,17)+bloom(26,45,'#d4ba63',.65);
art.sprout=[[28,80,24,-13],[42,85,39,-7],[58,83,31,14],[71,80,38,20],[54,86,49,0]].map(([x,y,h,a])=>G(L(`M0 0Q-8 ${-h/2} 0 ${-h}`,'#ddd4ac',5)+L('M0 0q-7 2-5 6','#b8a57d',1)+E(-3,-h,5,7,'#a4b176',-35)+E(4,-h-1,5,7,'#c2c994',35)+L(`M0 ${-h}v-4`,'#87965e',1),x,y,a)).join('');
art.potato=L('M50 72 49 25M49 55 25 36M49 43 73 25','#839752',3)+leaf(48,64,33,17,-64)+leaf(53,57,31,17,59,'#668249')+leaf(42,43,28,15,-47)+leaf(54,35,29,13,48)+leaf(49,26,20,10,3)+bloom(69,24,'#c3afbd',.75)+bloom(27,34,'#d4c8cc',.6)+L('M48 71 33 82m15-11 17 7','#a18b5e',1.5)+E(34,81,15,10,'#ad8c5e',-18)+E(62,79,17,11,'#c1a173',16)+E(48,88,12,7,'#a8875d')+L('m27 78 2-1m11 6 2 1m22-10 2-1m4 8 2 1m-23 4h2','#806c4d',1.5);
function bean(kind){
  let s=L('M48 88Q42 62 52 34T50 14M48 60 23 41M52 42 74 27','#8e9e60',2.5)+leaf(46,69,32,20,-63)+leaf(53,51,34,21,54,'#6e8b4b')+leaf(49,35,29,18,-36)+leaf(52,26,22,13,20)+L('M51 34q-17-14-23-5t9 3','#a8b77c',1);
  if(kind==='flat')s+=G(P('M0 0Q-12 12-9 37 4 31 9 8Q9 1 0 0','#a0ac68')+L('M0 5q-7 18-6 26','#d3d49a',1.5)+[10,19,28].map(y=>E(-2,y,4,4.5,'#b9c080')).join(''),30,42,-18)+G(P('M0 0Q-9 16-4 31 7 24 9 5Z','#819857')+L('M2 5-2 25','#b6c788',1.2),70,32,20);
  else if(kind==='large')s+=G(P('M0 0Q-14 13-8 37 6 37 11 15 12 2 0 0','#a2ab6b')+P('M0 5Q-7 19-6 32 5 29 7 13Z','#e0d4a6')+[12,22].map(y=>E(0,y,5.5,6.5,'#f0e5c3',20)).join(''),30,44,-10)+G(P('M0 0Q-10 11-7 29 6 32 9 8Z','#aebc7e'),69,36,19);
  else s+=G(P('M0 0Q-10 16-5 40 8 30 7 6Z','#c5be87')+L('M0 6-3 33','#e6deae',1.4)+[10,20,30].map(y=>E(0,y,3.5,5,'#e4d9b3')).join(''),30,42,-15)+G(P('M0 0Q-9 15-4 34 7 29 8 6Z','#aab87a'),70,33,17);
  return s+bloom(53,21,'#d8cec0',.6);
}
art.green_beans=bean('flat');art.garrofo=bean('large');art.beans_white_haricot=bean('white');
art.beet=L('M49 64 30 23M49 64 52 15M49 64 74 28','#a77579',3)+leaf(45,54,40,18,-30,'#637e50')+leaf(50,45,37,17,5,'#7b945b')+leaf(55,55,34,19,38,'#6c8752')+P('M48 54C20 48 20 79 43 86l5 9 5-9C81 72 73 49 48 54','#9c5965')+P('M46 58C28 55 28 76 44 80Q36 65 46 58','#bd7980')+L('M53 62q10 8 2 19','#763e51',1.3)+L('M36 69h8m-7 5h4','#d49a92',1.2);
art.cabbage=P('M49 88C14 92 9 56 20 36 14 18 35 12 48 28 63 11 82 17 80 36 96 67 81 90 49 88','#6d8952')+P('M48 87C22 87 21 61 29 44 24 23 41 25 49 38 61 23 77 29 70 48 78 70 68 88 48 87','#94aa6d')+P('M49 85C32 77 37 58 35 47 37 34 48 36 49 45 55 34 68 38 62 52 65 69 59 83 49 85','#c7cd99')+P('M48 85Q40 58 47 46 58 62 51 85','#e0dbaf')+L('M47 83Q30 63 29 38M52 82q18-20 19-42M24 52l11 7M64 60l12-8M46 71 39 62M54 67l5-12','#c2c997',1.3);
function featherStem(x,y,angle=0,scale=1,color='#819953'){
  let a=L('M0 0V-47',color,1.7);for(let i=0;i<5;i++){const yy=-7-i*8,w=15-i*1.8;a+=L(`M0 ${yy}q${-w} -1 ${-w} -11M0 ${yy}q${w} -1 ${w} -11`,color,2.6);}return G(a,x,y,angle,scale);
}
art.carrot=featherStem(46,51,-26,.82)+featherStem(49,49,3,.92,'#96a65f')+featherStem(54,53,30,.82,'#6b894c')+P('M33 50Q47 42 63 51 61 69 48 93 38 79 33 50','#cb8650')+P('M35 52Q41 47 48 50 41 70 48 91 34 73 35 52','#e2a165')+L('M47 58h10M37 65l9 1m1 10h7m-10 8h5','#a5653e',1.5);
art.konjac=L('M50 77 49 37','#9b9a68',5)+L('m49 67 2-2m-3-8 2-1m-2-10 2-2','#5f7550',2)+L('M49 37 21 28M49 37 76 24M49 37 46 12','#849653',2.5)+[ [21,29,28,13,-71],[23,30,25,12,-18],[29,32,25,11,20],[46,15,21,10,-24],[48,20,24,11,42],[72,27,27,13,63],[73,27,24,11,10],[62,31,26,12,-10] ].map(args=>leaf(...args)).join('')+P('M27 78q4-16 24-13 23-3 26 15-9 14-27 12-18 0-23-14','#8d7657')+E(47,75,18,8,'#aa9270')+L('m33 76 3-2m8 8 3 1m10-11 4 2m4 6 2-2','#6b5d45',1.8);
art.radish_white=lobed(47,48,-30,.92,'#718b50')+lobed(52,41,8,.92,'#91a75f')+lobed(54,50,48,.85,'#5d7d49')+P('M36 46Q48 40 61 47 68 66 50 90l-2 6-2-7C32 74 31 57 36 46','#d9d6b4')+P('M37 48Q44 45 48 47 39 68 48 89 35 76 35 59Z','#efead0')+P('M36 46q12-6 25 1l1 8q-15-8-28 1Z','#a9b784')+L('M52 66h7m-22 7h6m5 8h5','#b5b391',1.3);
art.celery=P('M37 86Q33 62 23 39l8-3 17 43 2-49h9l-1 49 15-45 8 5Q69 62 62 86Z','#a5b57c')+P('M43 86 33 42l5-2 15 46M53 86l9-48 5 2-7 46','#d0cfa0')+L('M45 83 28 40M55 83l20-43','#6e955e',1.4)+lobed(29,43,-26,.66)+lobed(52,33,0,.68,'#759357')+lobed(75,43,30,.65,'#62824e')+E(50,87,14,3,'#d5d5ac');
art.bamboo_shoot=P('M26 86Q28 53 49 17 68 45 73 85 54 95 26 86','#8d8550')+P('M26 86Q30 68 50 60 45 78 44 90Z','#b4a36b')+P('M73 85Q68 63 49 58 58 78 57 91Z','#c2ae76')+P('M33 64Q37 44 49 35 49 50 56 66Z','#bba776')+P('M65 64Q62 41 49 30 47 53 43 67Z','#8c935a')+P('M40 42Q43 25 49 17l12 27-13-7Z','#a8a16c')+L('M31 77q17 9 37 1M36 57q14 6 25 0','#ddd09a',1.2)+leaf(59,33,26,6,61,'#789151')+leaf(57,32,20,5,30,'#95a367');

// Aromatics: bulb, rhizome and leaf silhouettes stay readable at field-tile size.
function blades(kind){
 const broad=kind==='leek';return P(`M44 72Q29 33 24 11 38 22 49 62L44 8Q57 30 54 62 61 19 74 11 68 43 58 73Z`,broad?'#71917b':'#759556')+P('M48 70Q39 31 38 12 48 27 52 58 54 27 64 5 64 37 56 72Z',broad?'#93aa8b':'#9bb06c')+L('M49 62 31 22M53 56l7-32',broad?'#b7c5a1':'#c0cb8a',1);
}
art.onion=blades('onion')+P('M42 54q-3 8-12 14-15 22 17 23 30 0 24-18-4-10-14-19Z','#bf9660')+P('M46 57C24 77 32 88 48 88 38 78 48 66 49 57','#d6b580')+L('M54 60q17 21 3 27M45 63q-10 18-3 24','#8c714c',1.2)+roots(49,89);
art.garlic=blades('garlic')+P('M46 51Q42 63 29 70 19 83 35 89h28q18-7 5-19-13-7-14-19Z','#cfcaad')+E(39,78,10,12,'#e6ddbd',15)+E(55,77,10,14,'#ede5cc',-10)+P('M49 57Q42 71 47 89 39 79 43 66Z','#b5ab91')+L('M57 63q11 12 4 23','#b3a98f',1)+roots(49,90);
function rhizome(turmeric=false){
 let s=L('M51 74 50 24M52 53 72 36','#8b9a58',3)+leaf(50,58,47,17,-33,turmeric?'#8ba45e':'#809b56')+leaf(53,45,43,14,35,'#6a8950')+leaf(50,31,29,10,-9)+leaf(52,69,37,12,62,'#9aab69');
 const base=turmeric?'#c2914d':'#c1a477',hi=turmeric?'#dbad62':'#dbc398';
 s+=L('M27 84 39 75l13 6 18-11M46 79 47 66m11 11 10 9',base,13)+L('M27 82 39 73l13 6 18-11M46 77V66',hi,7)+L('M33 77l2 8m7-13 4 4m13-4 3 7m4-11 3 6',turmeric?'#a6763c':'#9e835c',1.2);
 if(turmeric)s+=E(73,79,7,5,'#e1b76e',25)+E(73,79,5.2,3.5,'#cf7f37',25);return s;
}
art.ginger=rhizome();art.turmeric=rhizome(true);
art.shallot=G(blades('shallot'),0,0,-8,.92)+[[36,77,-15],[57,77,12],[48,84,0]].map(([x,y,a])=>G(P('M-4-20Q-4-12-10-5-20 14 0 14 20 12 10-5 4-12 4-20Z','#9c6c70')+P('M-3-16Q-16 11-2 12-7 1 0-14Z','#c39191')+L('M4-9q9 13 1 19','#774d59',1)+roots(0,13),x,y,a,.8)).join('');
art.leek=blades('leek')+P('M42 54 55 57 59 86Q53 92 45 88Z','#d2d4b5')+P('M44 55 49 56 52 88 46 88Z','#eee8cb')+L('M53 60 56 85','#a7b99c',1)+roots(51,89);
art.scallion=G(blades('scallion'),2,-3,6,.95)+L('M38 54 44 86M49 53 51 87M60 54 58 85','#d6d9b2',5)+L('M38 55 41 70M49 53l1 15M60 54l-1 14','#adbf82',5)+roots(44,87)+roots(52,88)+roots(59,86);
art.cilantro=L('M49 89 48 27M48 78 25 50M50 71 75 43M49 60 31 25M50 52 65 20','#91a365',2)+lobed(25,53,-42,.68)+lobed(74,47,44,.69,'#6b8a4d')+lobed(32,31,-32,.61,'#87a258')+lobed(65,27,34,.64)+lobed(48,28,0,.6,'#98ab67')+lobed(47,69,-43,.65,'#73904f')+roots(49,88);

// Spices: seed heads, pods and fruit; no generic leafy fallback.
function aniseStar(x,y,size,angle=0){let a='';for(let i=0;i<8;i++)a+=G(P('M0 0Q-8-5 0-18 8-6 0 0','#a17b52')+P('M0-3Q-3-8 0-14 3-8 0-3','#654d36')+E(0,-7,1.5,3,'#c19a65'),0,0,i*45);return G(a,x,y,angle,size);}
art.star_anise=L('M48 88 46 32M47 65 25 44M47 58 72 28','#7c7450',4)+leaf(46,56,39,13,-55,'#72864f')+leaf(50,43,39,13,42,'#627b49')+leaf(46,33,26,10,-2)+leaf(50,75,33,12,62)+aniseStar(31,60,.94,15)+aniseStar(66,61,.8,-10)+aniseStar(49,78,.7,9);
art.sesame=L('M49 88 49 16M49 67 32 42M49 55 67 29','#94a167',3)+leaf(47,78,32,10,-58)+leaf(51,65,30,10,53,'#6b884e')+leaf(47,48,26,9,-42)+leaf(51,32,21,8,34)+[[39,60,-24],[56,49,22],[41,35,-25],[57,25,20]].map(([x,y,a])=>G(P('M0-11Q-8-4-6 11q6 9 12 0C8-2 5-8 0-11','#b7b181')+L('M0-7V13M-4-3v11','#e0d5a3',1.1),x,y,a)).join('')+G(P('M-4 0V-9q-6-3-4-7l8 2 8-2q2 4-4 7V0Z','#d6c6cc'),48,16)+C(48,17,2,'#c4b47a');
art.pumpkin_seed=L('M27 83q-16-17 4-34t32-6q25 7 20 18t-13 1','#9aab69',2)+lobed(30,49,-36,.9,'#728b4d')+lobed(66,41,36,.88,'#8b9f5a')+P('M52 63q-9-17-1-22l6 3-3 19Z','#7d8b50')+E(51,73,29,19,'#b9854e')+E(39,73,13,18,'#cd9958')+E(62,73,13,18,'#be8a4e')+E(51,74,12,19,'#d4a363')+L('M51 57q-5 15 0 33','#a97843',1.3)+E(77,86,4,7,'#e0d5ab',50)+E(84,81,3.5,6,'#e9dfbc',30);
function umbel(x,y,width,color,seeds=false){let s='';for(let i=0;i<7;i++){const dx=(i-3)*width/6,dy=-11-Math.sin(i/6*Math.PI)*6;s+=L(`M0 3 ${dx} ${dy}`,'#a4aa70',.9);s+=seeds?E(dx,dy,2.6,3.3,color,-15+i*5):C(dx,dy,2.6,color)+C(dx-2,dy+1,1.5,color);}return G(s,x,y);}
art.cumin=L('M47 89 46 41M47 71 25 52M47 63 72 36','#8d9b60',1.8)+featherStem(45,79,-35,.65)+featherStem(50,75,40,.63,'#799452')+umbel(46,40,23,'#d5c7a0',true)+umbel(25,51,19,'#c9b78c',true)+umbel(72,35,21,'#d8c9aa',true)+E(67,87,2.7,7,'#b3a071',35)+L('m63 91 6-8','#dfcba0',.8);
art.coriander_seed=L('M47 88 48 35M47 72 25 48M48 61 72 41','#9a9f63',2)+lobed(44,78,-55,.56,'#829458')+lobed(54,67,52,.51,'#7a8e55')+umbel(48,35,25,'#c3ac70',true)+umbel(25,48,22,'#bda16a',true)+umbel(72,41,24,'#cbb77d',true)+C(69,86,4,'#c8ad76')+C(79,84,3.4,'#b69d67')+L('M68 83q-2 3 0 6M78 81q-2 3 0 6','#e3cf9e',.8);
art.fennel_seed=L('M49 89 50 30M49 64 25 38M50 57 76 34','#9bab64',2.1)+featherStem(46,79,-38,.7)+featherStem(52,74,42,.78,'#9eb66b')+featherStem(49,58,-20,.52)+umbel(50,27,30,'#caba67')+umbel(24,38,26,'#d0bc68')+umbel(76,34,25,'#c1b35c')+E(71,87,3,7,'#a6ab72',35)+E(81,84,2.5,6,'#c3bd83',55)+L('m68 91 6-9','#d9d2a0',.8);
art.mustard_seed=L('M49 89 48 29M49 65 26 45M49 50 71 27','#91a05d',2.4)+lobed(44,80,-53,.67,'#78954f')+lobed(54,67,52,.63,'#8da45e')+leaf(46,48,20,7,-36)+[[27,43],[43,28],[53,19],[66,29],[74,19]].map(([x,y])=>bloom(x,y,'#d9be62',.75)).join('')+L('M45 54 31 40M51 43 63 32M49 70 66 55','#acb675',2.8)+C(71,84,3,'#bb9f58')+C(79,87,2.5,'#ceb770')+C(81,80,2,'#b39c60');
function chili(kashmir=false){
 let s=L('M49 89 49 24M49 65 28 45M49 52 71 33','#8c9a58',3)+leaf(47,77,37,17,-65)+leaf(53,67,36,16,60,'#658247')+leaf(47,47,30,13,-40)+leaf(54,39,28,12,44)+leaf(49,27,22,11);
 for(const [x,y,a,scale]of [[29,46,-15,1],[68,36,18,.9]]){
  let pod=kashmir?P('M-7 0C-16 15-9 35 4 41 0 28 16 18 9 3Z','#a85345')+P('M-5 2Q-11 16-1 32-5 15 3 4Z','#c77a58')+L('M5 8q-5 8 1 16M-4 13l-2 7','#844538',1):P('M-5 0C-14 12-5 34 9 38 1 27 12 14 6 2Z','#bf6649')+P('M-4 4Q-8 17 2 29-2 14 2 5Z','#df9065');
  pod+=P('M-8 3l2-8 9 1 6 9-8-3-5 3Z','#758c4e')+L('M-1-3 1-9','#99a366',2);s+=G(pod,x,y,a,scale);
 }return s;
}
art.chili_kashmir=chili(true);art.chili_red=chili();

// Fruit and nut crops. Shared branches unify style, while every fruit has its own silhouette.
function orchard(narrow=false){return L('M48 90 48 35M48 68 25 41M48 57 73 29','#7d6741',4.6)+leaf(46,44,41,narrow?10:21,-56,'#6d874d')+leaf(52,41,39,narrow?10:21,49,'#799453')+leaf(48,30,25,narrow?8:14,8,'#8d9e5f')+leaf(32,62,29,narrow?9:16,-69,'#67804b')+leaf(59,64,33,narrow?9:17,78,'#607c47')+L('M32 40 32 57M68 35 66 50M51 59 54 74','#95925c',1.7);}
art.plantain=P('M43 90Q50 59 46 22l9-1q2 41-3 69Z','#9c9e68')+P('M50 37Q12 38 12 12 43 7 50 37','#78964f')+P('M52 37Q56 5 87 15 86 37 52 37','#8fa35b')+P('M48 51Q15 67 7 41 32 26 48 51','#66864b')+P('M53 48Q83 32 94 58 68 68 53 48','#5c7e48')+P('M49 29Q31 7 49 3 67 10 49 29','#a0ad6b')+L('M20 17 47 34M57 33l24-16M17 44l27 5m14 0 26 7','#b2bc77',1)+L('M51 37q18 4 13 17','#89955a',3)+[0,1,2].map(i=>L(`M${58+i*7} 54q7 21-10 24`,'#c9bd70',6)+L(`M${57+i*7} 54q4 17-9 21`,'#ded190',2)).join('')+P('M56 83q-10 6-8 12 11-2 12-11Z','#93716d');
art.almond=orchard(true)+[[32,61,-15],[66,54,15],[54,78,5]].map(([x,y,a])=>G(P('M0-13Q-17-6-11 11 0 23 11 9 17-6 0-13','#a1a568')+P('M0-10Q-7 1-7 12 3 17 9 5 8-5 0-10','#d0bc89')+P('M0-5Q-9 3-3 13 7 11 7 4 6-1 0-5','#ac8053')+L('M0-1 1 9','#dbb880',1),x,y,a,.86)).join('');
art.peanut=L('M49 72 48 29M48 60 24 40M49 54 73 35M46 72 31 82M51 73 67 83','#909d5d',2.4)+[[25,42,-52],[47,30,-15],[72,37,45],[33,63,-60],[62,60,63]].map(([x,y,a])=>G(leaf(-2,1,22,13,-28,'#839e59')+leaf(2,1,22,13,28,'#9bb06a'),x,y,a)).join('')+bloom(34,54,'#d8ba60',.55)+[[34,81,-25],[64,81,20]].map(([x,y,a])=>G(P('M0-9Q-10-14-13-5q-2 6 4 9-3 10 6 12 11 0 11-9 7-8-1-15Z','#c0a06d')+L('M-7-5 4 5M-8 1l10 10M0-7l-6 17M6-1-2 12','#977c50',.9),x,y,a,.8)).join('');
art.sugarcane=L('M37 88 34 23M51 88 53 17M65 87 70 30','#9ca778',6)+L('M35 84 32 25M49 84 51 20M63 84 68 32','#bcc18b',2)+[35,50,65,80].map(y=>L(`M32 ${y}h7M49 ${y-5}h7M64 ${y+1}h7`,'#637d57',2)).join('')+P('M34 32Q6 26 8 13 27 13 34 32M53 27Q28 5 26 3 48 4 53 27M54 29Q69 2 88 7 66 14 54 29M69 41Q85 19 97 30 81 29 69 41M53 43Q30 31 17 39 35 29 53 43','#78964f')+P('M53 29Q50 5 61 3 60 16 53 29M70 41Q91 41 91 58 81 44 70 41','#a3b270');
art.lemon=orchard()+[[32,61,-20,1],[66,54,24,.9],[54,78,6,.8]].map(([x,y,a,s])=>G(P('M0-12Q5-9 11-6 18 5 6 13L1 15l-4-3C-19 8-16-8-4-11Z','#c9b65d')+P('M-3-8Q-14-4-9 5-6 0 4-5Z','#e1d17d')+C(6,6,.9,'#a89950'),x,y,a,s)).join('');
art.apricot=orchard()+[[32,61,12],[66,54,11],[54,78,9]].map(([x,y,r])=>C(x,y,r,'#c58d55')+E(x-2,y-1,r*.78,r*.9,'#dfad6d')+E(x+4,y+3,r*.4,r*.53,'#cf8b5c')+L(`M${x+1} ${y-r+2}q-4 ${r} 0 ${r*1.7}`,'#b97b4c',1)+L(`M${x-6} ${y-4}l3-2`,'#eecb91',2)).join('');
art.pear=orchard()+[[31,61,-14,1],[66,54,18,.86],[55,77,8,.68]].map(([x,y,a,s])=>G(P('M-4-14h7q-1 9 7 15 15 20-9 22-25-1-12-20 8-9 7-17Z','#b7b371')+P('M-3-10Q-3-2-10 7-18 21-2 20-12 13 0 0L0-10Z','#d2c88b')+L('M0-14 2-20','#897343',2)+C(5,13,1,'#929252')+C(-1,17,.8,'#929252'),x,y,a,s*.8)).join('');
// Original cherry drawing, kept intact as the accepted style reference.
art.cherry=L('M48 90 48 39M48 67 30 43M48 60 68 32','#7d6741',5)+P('M48 43Q15 40 14 24q24-12 34 19M48 49Q55 17 79 21 80 43 48 49M47 31Q33 8 53 7q13 11-6 24M30 52Q10 60 9 43q14-10 21 9M60 59Q91 43 91 61 81 77 60 59','#647e48')+L('M20 26 42 39M57 40l14-12M67 60l17-1','#93a064',1.2)+L('m37 39 3 20m9-24 6 22m17-18-4 31','#918755',2)+C(37,62,9,'#ab5048')+C(53,61,9,'#c36a58')+C(67,73,8,'#98463e')+L('m33 58 3-2m14 1 3-1m11 14 2-1','#e19a79',3);
function chestnut(x,y,scale=1){let s='';for(let i=0;i<18;i++)s+=G(P('M-3-10 0-20 3-10Z',i%2?'#9ca56a':'#7f9259'),0,0,i*20);return G(s+C(0,0,14,'#a8ac72')+P('M0-10Q-17 2-7 12 7 20 13 6 13-3 0-10','#825b3e')+P('M-8 7Q0 10 11 6l-3 8q-11 4-16-7Z','#b99b6c')+L('M-2-5Q-9-1-7 4','#bd8a59',2),x,y,0,scale);}
art.chestnut=orchard(true)+chestnut(31,61,.9)+chestnut(67,54,.78)+chestnut(56,80,.62);
art.lotus_seed=L('M49 89 44 42M52 88 75 36M45 85 23 55','#859b66',2.5)+P('M11 62Q8 39 33 34 57 33 60 54L34 55 51 70Q22 79 11 62','#789b67')+L('M33 54 16 47M33 54l-13 11m13-11 10-15m-10 15 18-8','#b9c78d',1)+P('M29 39 55 36 51 55Q42 65 34 54Z','#a6ab69')+E(42,38,14,6,'#c6c38a',-7)+[[33,38],[40,35],[49,37],[41,40],[48,41]].map(([x,y])=>E(x,y,1.8,1.3,'#6c8150')).join('')+G(P('M0 3Q-20-2-16-16-4-11 0 3','#b9939e')+P('M0 3Q-11-15 0-24 10-13 0 3','#dec0bd')+P('M0 3Q4-14 17-17 21-3 0 3','#c8a1ab')+E(0,3,10,3,'#b8a568'),75,36)+P('M43 79Q58 58 87 71 95 88 60 89Z','#688b5e')+L('M61 80 83 76m-22 4 16 6','#a0ba82',1.1);

// Keep the broad konjac canopy within the shared tile frame.
art.konjac=G(art.konjac,6,5,0,.91);
art.wheat_durum=G(art.wheat_durum,4,7,0,.91);
art.shallot=G(art.shallot,6,5,0,.89);
art.sesame=G(art.sesame,3,4,0,.94);
export const cropArtIds=Object.freeze(Object.keys(art));
const escapeAttr=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderCropArt(id,klass=''){
  if(!Object.hasOwn(art,id))throw new Error(`Missing crop artwork: ${id}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" class="au-botanical ${escapeAttr(klass)}" viewBox="0 0 100 100" aria-hidden="true">${shadow}${art[id]}</svg>`;
}
export function cropArtFile(id,name){
  return renderCropArt(id).replace('aria-hidden="true"', 'role="img"').replace(shadow,`<title>${escapeAttr(name)}</title>${shadow}`);
}
