"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processStacking = processStacking;
const MERGE_THRESHOLD = 5.0;
function processStacking(units, edges) {
    const deadIds = [];
    // Group by edge to reduce checks
    const unitsByEdge = new Map();
    for (const u of units) {
        if (!unitsByEdge.has(u.edgeId))
            unitsByEdge.set(u.edgeId, []);
        unitsByEdge.get(u.edgeId).push(u);
    }
    // Check overlaps per edge
    for (const [edgeId, list] of unitsByEdge) {
        if (list.length < 2)
            continue;
        // Sort by distance so we only check neighbors
        list.sort((a, b) => a.distanceOnEdge - b.distanceOnEdge);
        for (let i = 0; i < list.length - 1; i++) {
            const u1 = list[i];
            const u2 = list[i + 1];
            // Must be same owner
            if (u1.ownerId !== u2.ownerId)
                continue;
            // Must be overlapping
            const dist = Math.abs(u1.distanceOnEdge - u2.distanceOnEdge);
            if (dist <= MERGE_THRESHOLD) {
                // MERGE DETECTED!
                // Keep u1, absorb u2
                u1.count = (u1.count || 1) + (u2.count || 1);
                u1.hp += u2.hp;
                u1.maxHp += u2.maxHp;
                // Mark u2 for death
                u2.hp = 0;
                deadIds.push(u2.id);
                // Remove u2 from list so it doesn't merge again
                list.splice(i + 1, 1);
                i--; // Re-check u1 against next neighbor
            }
        }
    }
    return deadIds;
}
