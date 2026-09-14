import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MapProjection = require('../js/core/map-projection.js').MapProjection;

for (const map of [{ width: 16, height: 16 }, { width: 7, height: 19 }, { width: 31, height: 5 }]) {
    for (const mode of ['legacy', 'isometric']) {
        const projection = MapProjection.create(map, 101, mode);
        for (let y = 0; y < map.height; y += 1) {
            for (let x = 0; x < map.width; x += 1) {
                const center = projection.cellCenter(x, y);
                assert.deepEqual(projection.pick(center.x, center.y), { x, y }, `${mode} center ${x},${y}`);
            }
        }
        assert.equal(projection.pick(-10, -10), null, `${mode} rejects outside map`);
    }
}

const iso = MapProjection.create({ width: 16, height: 16 }, 101, 'isometric');
assert.equal(iso.thickness, 30);
assert.ok(Math.abs((iso.tileHeight / iso.tileWidth) - Math.sin(Math.PI / 4)) < 1e-12, 'C view keeps the confirmed 45 degree ground ratio');
assert.ok(iso.directionVector(0, -1).x > 0 && iso.directionVector(0, -1).y < 0, 'W/world north projects upper-right');
assert.ok(iso.directionVector(-1, 0).x < 0 && iso.directionVector(-1, 0).y < 0, 'A/world west projects upper-left');
assert.ok(iso.directionVector(0, 1).x < 0 && iso.directionVector(0, 1).y > 0, 'S/world south projects lower-left');
assert.ok(iso.directionVector(1, 0).x > 0 && iso.directionVector(1, 0).y > 0, 'D/world east projects lower-right');

for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
        assert.equal(MapProjection.isAdjacentTurnTarget(8, 8, 8 + dx, 8 + dy), dx !== 0 || dy !== 0);
    }
}
assert.equal(MapProjection.isAdjacentTurnTarget(8, 8, 10, 8), false);
assert.equal(MapProjection.isAdjacentTurnTarget(8, 8, 8, 6), false);

console.log('isometric map projection tests passed');
