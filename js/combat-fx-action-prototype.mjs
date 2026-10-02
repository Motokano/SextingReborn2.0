// PROTOTYPE bridge: the visual scheduler consumes final per-segment results.
// It does not resolve equipment, roll hits, spend resources, or apply damage.
export function scheduleAttackFx({actionId,moveId,actor,target,side,at,windup,gap,recovery,plannedSegments,segments,burst=false}){
  const count=segments.length;
  return {
    actionId,
    plannedSegments,
    end:count?at+windup+(count-1)*gap+recovery:at,
    events:segments.map((s,i)=>({
      actionId,segmentId:`${actionId}:${i}`,actor,target,move:moveId,
      at:at+i*gap,hitAt:at+windup+i*gap,
      result:s.result,part:s.part,segment:i,segmentCount:count,
      plannedSegments,side,powerFactor:s.powerFactor??1,
      powerMultiplier:s.powerMultiplier,burst
    }))
  };
}

// Illustrative equipped modifier, intentionally absent from the real variant table.
// Application happens before the fixture creates segments, not inside drawing code.
export function resolvePreviewMove(baseMove,variantId,selectedMoveId){
  const modified=variantId==='triple'&&baseMove.id===selectedMoveId;
  const powerFactor=modified?.5:1;
  const basePower=Number(baseMove.move_power_multiplier),baseSegments=Number(baseMove.hit_segments);
  return {
    ...baseMove,
    hit_segments:modified?3:(Number.isFinite(baseSegments)?Math.max(1,Math.floor(baseSegments)):1),
    move_power_multiplier:(Number.isFinite(basePower)?basePower:1)*powerFactor,
    fxPowerFactor:powerFactor,
    previewVariantId:modified?'triple':null
  };
}
