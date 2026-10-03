// Visual comparison adapter: the approved renderer is shared with the live game.
import './combat-fx-paint.js';
import './combat-fx-presentation.js';
export const presentation=globalThis.CombatFxPresentation;
export const {accents,segmentGap,recovery,trailLife,contactLife,kinetic,attached,motionProgress,drawMoveTrail,drawMoveContact,drawDefense}=globalThis.CombatFxPaint;
