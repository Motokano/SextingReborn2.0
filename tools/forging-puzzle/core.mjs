// PROTOTYPE: pure grid operations shared by the generator and the offline game.
export function createForgeCore() {
  function geometry(mask) {
    const cells=[],index=new Map();
    mask.forEach((row,r)=>[...row].forEach((v,c)=>{if(v==='#'){index.set(r+','+c,cells.length);cells.push({r,c,label:String.fromCharCode(65+c)+(r+1)});}}));
    const neighbors=cells.map(({r,c})=>[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].map(p=>index.get(p.join(','))).filter(i=>i!==undefined));
    return {cells,neighbors,rows:mask.length,cols:mask[0].length,index};
  }
  function apply(board,op,g) {
    if(op==='Q')return board.map(v=>v+1);
    if(op==='T')return board.map(v=>Math.ceil(v/2));
    if(!Number.isInteger(op)||op<0||op>=board.length||board[op]<=0)return null;
    const next=board.slice(),v=next[op];next[op]=0;for(const i of g.neighbors[op])next[i]+=v;return next;
  }
  const equal=(a,b)=>!!a&&a.length===b.length&&a.every((v,i)=>v===b[i]);
  const cost=ops=>({h:ops.filter(o=>typeof o==='number').length,q:ops.filter(o=>o==='Q').length,t:ops.filter(o=>o==='T').length});
  function replay(board,ops,g,budget={h:Infinity,q:Infinity,t:Infinity}) {
    const used=cost(ops);if(Object.keys(used).some(k=>used[k]>budget[k]))return null;
    let b=board.slice();for(const op of ops){b=apply(b,op,g);if(!b)return null;}return b;
  }
  return {geometry,apply,equal,cost,replay};
}
