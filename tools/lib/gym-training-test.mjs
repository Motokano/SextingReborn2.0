// Reward tests need deterministic completion near 100%; random distribution
// and exact pool conservation are exercised separately by the growth-pool suite.
export function startTraining(g,id,groups=1) {
  const random=g.Math.random;g.Math.random=()=>.5;
  try{return g.GymSystem.startTraining(id,groups);}finally{g.Math.random=random;}
}
