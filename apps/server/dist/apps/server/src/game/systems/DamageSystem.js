"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCombat = processCombat;
const BASE_DPS = 20; // Damage per second PER UNIT
function processCombat(units, pairs, deltaTime) {
    if (!pairs.length)
        return;
    const unitsById = new Map(units.map((u) => [u.id, u]));
    const fightingUnitIds = new Set();
    for (const pair of pairs) {
        const unitA = unitsById.get(pair.aId);
        const unitB = unitsById.get(pair.bId);
        if (!unitA || !unitB)
            continue;
        // Skip if either is already dead
        if (unitA.hp <= 0 || unitB.hp <= 0)
            continue;
        unitA.state = 'COMBAT';
        unitB.state = 'COMBAT';
        fightingUnitIds.add(unitA.id);
        fightingUnitIds.add(unitB.id);
        // Calculate power based on stack count
        const countA = unitA.count || 1;
        const countB = unitB.count || 1;
        // Apply damage scaled by the enemy's unit count
        const damageToA = BASE_DPS * countB * deltaTime;
        const damageToB = BASE_DPS * countA * deltaTime;
        unitA.hp = Math.max(0, (unitA.hp ?? unitA.maxHp ?? 100) - damageToA);
        unitB.hp = Math.max(0, (unitB.hp ?? unitB.maxHp ?? 100) - damageToB);
    }
    for (const unit of units) {
        if (unit.state === 'COMBAT' && !fightingUnitIds.has(unit.id)) {
            const hasPath = !!(unit.pathQueue && unit.pathQueue.length > 0);
            unit.state = hasPath ? 'MOVING' : 'IDLE';
        }
    }
}
