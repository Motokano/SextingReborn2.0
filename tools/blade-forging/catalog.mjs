// PROTOTYPE: silhouettes and workshop goals, not weapon-stat or material formulas.
import {shapeFor} from '../forging-puzzle/shapes.mjs';
export const chapters=['初识炉火','辨形施锤','刚柔之间','百炼成形','精工细作','匠心之作'];
export const categories={B:'剑刃',T:'前端',D:'钝击侧',H:'手柄',M:'跨部位'};
export function catalogFrom(source){
 let parts=[];
 for(const line of source.split(/\r?\n/)){
  let m=line.match(/^\| ([1-6]) \| ([BTDH]\d{2}) ([^|]+) \|/);
  if(m)parts.push({id:m[2],name:m[3].trim(),tier:+m[1],category:m[2][0]});
  m=line.match(/^\| (M\d{2}-T([1-6])) ([^|]+) \|/);
  if(m)parts.push({id:m[1],name:m[3].trim(),tier:+m[2],category:'M'});
 }
 if(parts.length!==83||new Set(parts.map(p=>p.id)).size!==83)throw Error('Expected the 83 existing component designs.');
 parts=chapters.flatMap((_,i)=>{
  const groups=Object.keys(categories).map(c=>parts.filter(p=>p.tier===i+1&&p.category===c)),chapter=[];
  while(groups.some(g=>g.length))for(const group of groups)if(group.length)chapter.push(group.shift());return chapter;
 });
 return parts.map((part,number)=>{
  const n=Number(part.id.slice(1,3)),mask=shapeFor(part),rows=mask.length,cols=mask[0].length;
  const cells=mask.flatMap((row,r)=>[...row].flatMap((v,c)=>v==='#'?[{r,c}]:[]));
  const left=r=>mask[r].indexOf('#'),right=r=>mask[r].lastIndexOf('#');
  let goalType='high',scoreLabel,region,predicate;
  if(part.category==='B'){
   goalType=[4,10,13,15].includes(n)?'low':[2,7,8,12,14,17].includes(n)?'range':'high';
   scoreLabel=goalType==='low'?'刃缘余量':'刃口';region='每行最右侧的有效格，沿整条刃缘计分';predicate=p=>p.c===right(p.r);
  }else if(part.category==='T'){
   goalType=n%2?'high':[6,10].includes(n)?'low':'range';
   scoreLabel=n%2?'尖端':'击头端面';region=n%2?'顶端三行的中心脊线':'顶端两行的完整端面';
   predicate=p=>n%2?p.r<3&&p.c===Math.floor(cols/2):p.r<2;
  }else if(part.category==='D'){
   goalType=[7,13].includes(n)?'low':[3,5,9,11,12,15,17,18].includes(n)?'range':'high';
   if([10,16].includes(n)){scoreLabel='端部击面';region='上端三行，锻出端部着力面';predicate=p=>p.r<3;}
   else if([7,13].includes(n)){scoreLabel='外缘余量';region='左右外缘各格，中间保留供料';predicate=p=>p.c===left(p.r)||p.c===right(p.r);}
   else {scoreLabel='侧面击面';region='每行最右侧两格，形成宽一些的着力面';predicate=p=>p.c>=right(p.r)-1;}
  }else if(part.category==='H'){
   const bare=[1,4,7,10,13,16].includes(n);
   goalType=bare?([1,7,13].includes(n)?'low':'high'):'range';
   scoreLabel=bare?(n===13?'尾刺':'柄首'):'护手';
   if(bare){region='底端两行的柄首或尾部';predicate=p=>p.r>=rows-2;}
   else if([3,9,14].includes(n)){region='上部护弓的外侧与顶沿，握持区不计分';predicate=p=>p.r<rows-2&&(p.r===0||p.c===right(p.r));}
   else {region='上方两行的护手展开区域';predicate=p=>p.r<2;}
  }else{
   goalType=[3,6,8].includes(n)?'range':n===7&&part.tier>1?'low':'high';
   scoreLabel={1:'双侧锤面',2:'双侧斧刃',3:'锤面＋斧刃',4:'锤面＋镐尖',5:'双刃＋剑尖',6:'刃口＋刀背＋尖端',7:'棍侧＋棍顶',8:'双锤面＋冠刺'}[n];
   const tip=n>=5;
   region=(tip?'两侧外缘和顶端':'两侧外缘')+'合计；重叠格只算一次';
   predicate=p=>(tip&&p.r===0)||p.c===left(p.r)||p.c===right(p.r);
   if(n===4){region='左侧锤面与右侧镐尖合计';predicate=p=>p.c===left(p.r)||p.c===cols-1;}
  }
  const scoreIndices=cells.flatMap((p,i)=>predicate(p)?[i]:[]),scoring=new Set(scoreIndices);
  // Vary stock thickness by function; fixed within a level, random passives only.
  let initial=cells.map((p,i)=>goalType==='low'?(scoring.has(i)?3+(p.r+n)%2:1):1+((p.r*3+p.c+n)%3));
  if(part.id==='B01')initial=cells.map(p=>p.c===0?2:p.c===1?(p.r%2?2:1):1);
  // H01 needs stock outside the pommel so tempering helps without completing it alone.
  if(part.id==='H01')initial=initial.map((value,i)=>scoring.has(i)?value:2);
  return {...part,number:number+1,mask,initial,scoreIndices,scoreLabel,region,goalType,budget:{h:8,light:3,cross:1,q:1,t:1}};
 });
}
