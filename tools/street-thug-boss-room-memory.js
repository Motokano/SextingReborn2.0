// This file must run before every game script in the isolated review document.
(()=>{const memory=new Map();Object.defineProperty(window,'localStorage',{value:{
 getItem:k=>memory.get(String(k))??null,setItem:(k,v)=>memory.set(String(k),String(v)),
 removeItem:k=>memory.delete(String(k)),clear:()=>memory.clear(),
 key:n=>Array.from(memory.keys())[n]??null,get length(){return memory.size}
}});})();
