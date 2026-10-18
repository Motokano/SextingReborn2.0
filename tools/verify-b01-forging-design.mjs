// Standalone arithmetic verification of a design candidate; not game runtime.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const spec = JSON.parse(fs.readFileSync(new URL('../docs/design/examples/b01-forging-grid-v1.json', import.meta.url), 'utf8'));
const initial = spec.template.flat(), target = spec.target.flat(), n = initial.length;
const index = label => (Number(label.slice(1)) - 1) * 3 + spec.columns.indexOf(label[0]);
const adjacent = Array.from({length:n}, (_, i) => [i%3>0?i-1:-1,i%3<2?i+1:-1,i>=3?i-3:-1,i<n-3?i+3:-1].filter(j=>j>=0));
const sum = board => board.reduce((a,b)=>a+b,0);
const matches = board => board.every((v,i)=>v===target[i]);
function step(board, op) {
  if(op==='Q') return board.map(v=>v+1);
  if(op==='T') return board.map(v=>Math.ceil(v/2));
  const at=index(op), next=[...board], value=board[at];
  assert.ok(value>0, 'Reference paths must not hammer zero');
  next[at]=0;
  for(const j of adjacent[at]) next[j]+=value;
  return next;
}
function replay(board, path) {for(const op of path)board=step(board,op);return board;}
// Exhaust all legal interleavings with at most two hammers and one Q/T each.
function findShortSolution(board) {
  const seen=new Set();
  function visit(b,h,q,t,path) {
    if(matches(b))return path;
    const key=b.join(',')+'|'+h+q+t;
    if(seen.has(key))return null;
    seen.add(key);
    if(q) {const result=visit(step(b,'Q'),h,0,t,[...path,'Q']);if(result)return result;}
    if(t) {const result=visit(step(b,'T'),h,q,0,[...path,'T']);if(result)return result;}
    if(h)for(let i=0;i<n;i++)if(b[i]>0){
      const op=spec.columns[i%3]+(Math.floor(i/3)+1);
      const result=visit(step(b,op),h-1,q,t,[...path,op]);if(result)return result;
    }
    return null;
  }
  return {solution:visit(board,2,1,1,[]),states:seen.size};
}
const reports=[];
for(const c of spec.cases) {
  let board=[...initial];
  for(const move of c.transfers){board[index(move.from)]-=move.amount;board[index(move.to)]+=move.amount;}
  assert.equal(sum(board),sum(initial));assert.ok(board.every(v=>Number.isInteger(v)&&v>=0));
  const start=[...board], states=[start];
  const used={hammer:0,quench:0,temper:0};
  for(const op of c.solution){used[op==='Q'?'quench':op==='T'?'temper':'hammer']++;board=step(board,op);states.push(board);}
  assert.ok(matches(board));assert.ok(used.hammer<=spec.referenceHammerLimit);
  for(const type of Object.keys(used))assert.ok(used[type]<=spec.budget[type]);
  const short=findShortSolution(start);assert.equal(short.solution,null,'Overly easy case found');
  const oldRouteWorks=matches(replay(start,spec.cases[0].solution));
  if(c.transfers.length)assert.equal(oldRouteWorks,false,'Perturbation did not change the reference route');
  reports.push({id:c.id,initial:start,solution:c.solution,used,remainingHammers:spec.budget.hammer-used.hammer,
    sums:states.map(sum),states,minimumHammers:3,shortSearchStates:short.states,templateRouteWorks:oldRouteWorks});
}
// With a positive target, any last hammer needs a later Q to fill its zero.
// H alone never decreases the total; Q adds n. This target is below that bound.
assert.ok(target.every(v=>v>0));assert.ok(sum(target)<sum(initial)+n);
console.log(JSON.stringify({component:spec.component,target:spec.target,initialSum:sum(initial),targetSum:sum(target),reports},null,2));
