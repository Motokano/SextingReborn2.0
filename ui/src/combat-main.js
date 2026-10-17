import { mountCombat } from './runtime/combat-mount';

// A standalone entry keeps the approved loadout independent of the broader HUD migration.
mountCombat(window);
