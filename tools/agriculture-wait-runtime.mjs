// The isolated prototype uses the same action and world-tick pipeline as Space waiting.
export function advanceAgricultureWait(game) {
  if (!game.AgricultureActions.canUseOutdoorFacility('agriculture')) return { ok: false, stopped: true };
  const before = game.WorldTick.getWorldTotalTicks();
  game.SceneMovement.waitInPlace();
  const advanced = game.WorldTick.getWorldTotalTicks() - before;
  return {
    ok: advanced > 0,
    stopped: advanced <= 0 || !game.AgricultureActions.canUseOutdoorFacility('agriculture'),
    state: game.AgricultureMap.getState()
  };
}
