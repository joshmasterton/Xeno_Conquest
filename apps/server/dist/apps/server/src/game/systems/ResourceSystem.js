"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processResources = processResources;
function addYield(target, yieldPart) {
    if (!yieldPart)
        return;
    target.gold += yieldPart.gold ?? 0;
    target.manpower += yieldPart.manpower ?? 0;
}
function processResources(nodes, playerStates) {
    // Reset tallies before accumulation
    for (const [key, value] of playerStates) {
        value.gold = 0;
        value.manpower = 0;
    }
    for (const node of nodes) {
        if (!node.ownerId)
            continue;
        const existing = playerStates.get(node.ownerId) ?? { gold: 0, manpower: 0 };
        addYield(existing, node.resourceYield);
        playerStates.set(node.ownerId, existing);
    }
}
