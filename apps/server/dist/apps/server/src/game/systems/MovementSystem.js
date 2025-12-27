"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUnitPosition = updateUnitPosition;
function updateUnitPosition(unit, edge, allEdges, deltaTime) {
    if (unit.state === 'COMBAT')
        return unit;
    // Helper: Check if two edges are physically the same road (Forward or Reverse)
    const isSameRoad = (idA, idB) => {
        if (idA === idB)
            return true;
        const a = allEdges.find(e => e.id === idA);
        const b = allEdges.find(e => e.id === idB);
        if (!a || !b)
            return false;
        // Check if they connect the same nodes (regardless of direction)
        return (a.sourceNodeId === b.sourceNodeId && a.targetNodeId === b.targetNodeId) ||
            (a.sourceNodeId === b.targetNodeId && a.targetNodeId === b.sourceNodeId);
    };
    // 1. IDLE CHECK
    if (!unit.pathQueue || unit.pathQueue.length === 0) {
        // Ensure we clamp to target if we are sitting on it
        if (unit.targetEdgeId && unit.targetPercent != null && isSameRoad(unit.edgeId, unit.targetEdgeId)) {
            // Normalize stop distance to CURRENT edge length
            const targetIsReverse = unit.edgeId !== unit.targetEdgeId;
            const localTargetPercent = targetIsReverse ? (1.0 - unit.targetPercent) : unit.targetPercent;
            const stopDistance = edge.length * localTargetPercent;
            // Snap if we drifted past
            if (Math.abs(unit.distanceOnEdge - stopDistance) < 1.0) {
                unit.distanceOnEdge = stopDistance;
            }
        }
        return unit;
    }
    unit.distanceOnEdge += unit.speed * deltaTime;
    // 2. STOP CHECK (Before moving nodes)
    if (unit.targetEdgeId && unit.targetPercent != null && isSameRoad(unit.edgeId, unit.targetEdgeId)) {
        const targetIsReverse = unit.edgeId !== unit.targetEdgeId;
        const localTargetPercent = targetIsReverse ? (1.0 - unit.targetPercent) : unit.targetPercent;
        const stopDistance = edge.length * localTargetPercent;
        // If we crossed the point (forward movement)
        if (unit.distanceOnEdge >= stopDistance) {
            unit.distanceOnEdge = stopDistance;
            unit.pathQueue = []; // HARD STOP
            return unit;
        }
    }
    let currentEdge = edge;
    // 3. NODE TRAVERSAL
    while (unit.distanceOnEdge >= currentEdge.length) {
        const excess = unit.distanceOnEdge - currentEdge.length;
        const atNodeId = currentEdge.targetNodeId;
        // Pop queue
        if (unit.pathQueue && unit.pathQueue.length > 0 && unit.pathQueue[0] === atNodeId) {
            unit.pathQueue.shift();
        }
        if (!unit.pathQueue || unit.pathQueue.length === 0) {
            unit.distanceOnEdge = currentEdge.length;
            return unit;
        }
        const nextTargetNodeId = unit.pathQueue[0];
        // FIND NEXT EDGE
        // Prefer the specific target edge ID if it matches
        let nextEdge = allEdges.find((e) => e.id === unit.targetEdgeId && e.sourceNodeId === atNodeId && e.targetNodeId === nextTargetNodeId);
        // Fallback to any valid edge
        if (!nextEdge) {
            nextEdge = allEdges.find((e) => e.sourceNodeId === atNodeId && e.targetNodeId === nextTargetNodeId);
        }
        if (!nextEdge) {
            unit.distanceOnEdge = currentEdge.length;
            return unit;
        }
        unit.edgeId = nextEdge.id;
        unit.distanceOnEdge = excess;
        currentEdge = nextEdge;
        // 4. STOP CHECK (After entering new edge)
        if (unit.targetEdgeId && unit.targetPercent != null && isSameRoad(unit.edgeId, unit.targetEdgeId)) {
            const targetIsReverse = unit.edgeId !== unit.targetEdgeId;
            const localTargetPercent = targetIsReverse ? (1.0 - unit.targetPercent) : unit.targetPercent;
            const stopDistance = currentEdge.length * localTargetPercent;
            if (unit.distanceOnEdge >= stopDistance) {
                unit.distanceOnEdge = stopDistance;
                unit.pathQueue = [];
                break;
            }
        }
    }
    return unit;
}
