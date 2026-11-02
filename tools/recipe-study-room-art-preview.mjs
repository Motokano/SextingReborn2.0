// The review uses the same furnishing pass and catalog as the formal dungeon.
export async function dressStudyRoom(g){
 const room=g.DungeonRuntime.getSim().map.rooms.find(r=>r.recipeStudyRoom);
 if(!room)return false;
 if(room.studyDecorVersion!==1)throw Error('正式资料室陈设未生成');
 const note=document.getElementById('study-art-note');if(note)note.textContent='旧铁档案架 · 旧图筒架 · 补面矮凳';
 return true;
}
