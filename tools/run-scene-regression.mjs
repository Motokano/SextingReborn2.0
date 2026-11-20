import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkRepository } from './check-scene-entry.mjs';

checkRepository();
const names = [
  'modular-weapon-scene','modular-weapon-combat','combat-metaskills','combat-damage-runtime','combat-resource-costs',
  'combat-map-transition','combat-engagement','player-death-combat','death-system','enemy-body-runtime',
  'footwork-parry','parry-variant-retirement','jab-power-range','enemy-attack-power-ranges','combat-loadout',
  'breath-burst','direction-indicator','movement-reserves','story-opening','injuries','bleeding-medicine','medical-skills','health-vitality-growth',
  'action-wheel','svelte-interactions','svelte-panels','svelte-hud-game','svelte-facilities','svelte-hud','svelte-carry','ui-window-recovery',
  'gym-runtime','gym-growth-pool','sleep-runtime','facility-world-time','bathroom-facility','book-reading','outdoor-facilities',
  'pharmacy-panel-state','pharmacy-unlock','pharmacy-results','pharmacy-equipment','sewing-station',
  'muscle-neck-rewards','muscle-head-rewards','muscle-mouth-rewards','muscle-calf-rewards','muscle-hand-rewards',
  'muscle-limb-damage','muscle-thigh-rewards','muscle-back-rewards','muscle-chest-rewards','muscle-abdomen-rewards',
  'muscle-pelvis-rewards','muscle-shoulder-rewards','muscle-hip-rewards','core-muscle-rewards',
  'muscle-navigation','scene-entry-architecture','scene-entry-runtime'
];
// Do not suppress pre-existing failures: this is the complete affected-area regression.
const result = spawnSync(process.execPath, ['--test','--test-concurrency=2',...names.map(n=>'tools/test-'+n+'.mjs'),'tools/test-compost-panel.js'], {
  cwd:fileURLToPath(new URL('..',import.meta.url)),stdio:'inherit'
});
if(result.error) throw result.error;
process.exitCode=result.status??1;
