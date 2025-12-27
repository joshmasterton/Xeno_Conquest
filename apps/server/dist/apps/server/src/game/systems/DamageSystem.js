"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCombat = processCombat;
const DPS = 20; // Damage per second
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
        unitA.state = 'COMBAT';
        unitB.state = 'COMBAT';
        fightingUnitIds.add(unitA.id);
        fightingUnitIds.add(unitB.id);
        unitA.hp = Math.max(0, (unitA.hp ?? unitA.maxHp ?? 100) - DPS * deltaTime);
        unitB.hp = Math.max(0, (unitB.hp ?? unitB.maxHp ?? 100) - DPS * deltaTime);
    }
    for (const unit of units) {
        if (unit.state === 'COMBAT' && !fightingUnitIds.has(unit.id)) {
            const hasPath = !!(unit.pathQueue && unit.pathQueue.length > 0);
            unit.state = hasPath ? 'MOVING' : 'IDLE';
        }
    }
}
