"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectProximity = detectProximity;
const shared_1 = require("@xeno/shared");
const MovementView_1 = require("./MovementView");
// Simple uniform grid to avoid O(n^2) brute force
const cellSize = shared_1.COMBAT_RADIUS * 2;
function detectProximity(units, edges, nodesById) {
    // Map units by ID for quick faction lookup
    const unitsById = new Map(units.map(u => [u.id, u]));
    const buckets = new Map();
    const key = (x, y) => `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
    for (const u of units) {
        // Skip dead units
        if (u.hp <= 0)
            continue;
        const e = edges.find((edge) => edge.id === u.edgeId);
        if (!e)
            continue;
        const p = (0, MovementView_1.getUnitEdgePosition)(u, e, nodesById);
        const k = key(p.x, p.y);
        if (!buckets.has(k))
            buckets.set(k, []);
        buckets.get(k).push({ id: u.id, x: p.x, y: p.y });
    }
    const result = [];
    const visited = new Set();
    for (const [k, list] of buckets) {
        const [gx, gy] = k.split(':').map(Number);
        const neighbors = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const nk = `${gx + dx}:${gy + dy}`;
                const nlist = buckets.get(nk);
                if (nlist)
                    neighbors.push(...nlist);
            }
        }
        for (const a of list) {
            for (const b of neighbors) {
                if (a.id >= b.id)
                    continue; // avoid dup / self
                // Faction check: Don't fight friendlies
                const unitA = unitsById.get(a.id);
                const unitB = unitsById.get(b.id);
                if (!unitA || !unitB)
                    continue;
                if (unitA.ownerId === unitB.ownerId)
                    continue;
                const pairKey = `${a.id}|${b.id}`;
                if (visited.has(pairKey))
                    continue;
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist2 = dx * dx + dy * dy;
                if (dist2 <= shared_1.COMBAT_RADIUS * shared_1.COMBAT_RADIUS) {
                    visited.add(pairKey);
                    result.push({ aId: a.id, bId: b.id });
                }
            }
        }
    }
    return result;
}
