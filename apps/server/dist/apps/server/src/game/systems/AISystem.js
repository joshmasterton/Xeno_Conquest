"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAIUnits = createAIUnits;
exports.createAIUnitsFromBases = createAIUnitsFromBases;
exports.updateAIUnits = updateAIUnits;
const shared_1 = require("@xeno/shared");
const Pathing_1 = require("./Pathing");
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function createAIUnits(count, edges, nodes) {
    const units = [];
    for (let i = 0; i < count; i++) {
        const edge = pickRandom(edges);
        const startNodeId = edge.sourceNodeId;
        let endNodeId = pickRandom(nodes).id;
        let path = (0, Pathing_1.findPath)(edges, startNodeId, endNodeId);
        for (let attempts = 0; attempts < 5 && (!path || path.length < 2); attempts++) {
            endNodeId = pickRandom(nodes).id;
            if (endNodeId === startNodeId)
                continue;
            path = (0, Pathing_1.findPath)(edges, startNodeId, endNodeId);
        }
        let edgeId = edge.id;
        let pathQueue = [edge.targetNodeId];
        if (path && path.length >= 2) {
            const firstStep = (0, Pathing_1.edgeForStep)(edges, path[0], path[1]);
            if (firstStep)
                edgeId = firstStep.id;
            pathQueue = path.slice(1);
        }
        units.push({
            id: `ai-${i + 1}`,
            edgeId,
            distanceOnEdge: 0,
            speed: shared_1.UNIT_BASE_SPEED,
            pathQueue,
            hp: 100,
            maxHp: 100,
            state: 'IDLE',
            ownerId: 'ai_neutral',
            count: 1,
        });
    }
    return units;
}
function createAIUnitsFromBases(count, edges, nodes, baseNodeIds) {
    const units = [];
    const perBase = Math.max(1, Math.ceil(count / Math.max(1, baseNodeIds.length)));
    let uid = 1;
    for (let baseIndex = 0; baseIndex < baseNodeIds.length; baseIndex++) {
        const baseId = baseNodeIds[baseIndex];
        // Assign unique faction ID per base (enables AI vs AI combat)
        const factionId = `ai_faction_${baseIndex}`;
        const outgoing = edges.filter((e) => e.sourceNodeId === baseId);
        const fallbackIncoming = edges.filter((e) => e.targetNodeId === baseId);
        for (let i = 0; i < perBase && uid <= count; i++, uid++) {
            let startEdge = outgoing[0];
            let startNodeId = baseId;
            if (!startEdge && fallbackIncoming[0]) {
                const inc = fallbackIncoming[0];
                startEdge = edges.find((e) => e.sourceNodeId === baseId && e.targetNodeId === inc.sourceNodeId) || inc;
            }
            if (!startEdge) {
                startEdge = edges[0];
                startNodeId = startEdge.sourceNodeId;
            }
            let endNodeId = nodes[Math.floor(Math.random() * nodes.length)].id;
            let path = (0, Pathing_1.findPath)(edges, startNodeId, endNodeId);
            for (let attempts = 0; attempts < 5 && (!path || path.length < 2); attempts++) {
                endNodeId = nodes[Math.floor(Math.random() * nodes.length)].id;
                if (endNodeId === startNodeId)
                    continue;
                path = (0, Pathing_1.findPath)(edges, startNodeId, endNodeId);
            }
            let edgeId = startEdge.id;
            let pathQueue = [startEdge.targetNodeId];
            if (path && path.length >= 2) {
                const firstStep = (0, Pathing_1.edgeForStep)(edges, path[0], path[1]);
                if (firstStep)
                    edgeId = firstStep.id;
                pathQueue = path.slice(1);
            }
            units.push({
                id: `unit-${uid}`,
                edgeId,
                distanceOnEdge: 0,
                speed: shared_1.UNIT_BASE_SPEED,
                pathQueue,
                hp: 100,
                maxHp: 100,
                state: 'IDLE',
                ownerId: factionId,
                count: 1,
            });
        }
    }
    return units;
}
function updateAIUnits(units, edges, nodes) {
    const nodesById = new Map(nodes.map((n) => [n.id, n]));
    for (const unit of units) {
        // Only update units without a faction controller (ai_faction units are managed)
        if (unit.ownerId && unit.ownerId.startsWith('ai_faction'))
            continue;
        const currentEdge = edges.find((e) => e.id === unit.edgeId);
        if (!currentEdge)
            continue;
        const arrivedAtNode = unit.distanceOnEdge >= currentEdge.length;
        const hasNoPlan = !unit.pathQueue || unit.pathQueue.length === 0;
        if (arrivedAtNode && hasNoPlan) {
            const startNodeId = currentEdge.targetNodeId;
            let endNodeId = pickRandom(nodes).id;
            let path = (0, Pathing_1.findPath)(edges, startNodeId, endNodeId);
            for (let attempts = 0; attempts < 5 && (!path || path.length < 2); attempts++) {
                endNodeId = pickRandom(nodes).id;
                if (endNodeId === startNodeId)
                    continue;
                path = (0, Pathing_1.findPath)(edges, startNodeId, endNodeId);
            }
            if (path && path.length >= 2) {
                const next = (0, Pathing_1.edgeForStep)(edges, path[0], path[1]);
                if (next) {
                    unit.edgeId = next.id;
                    unit.distanceOnEdge = 0;
                    unit.pathQueue = path.slice(1);
                }
            }
            else {
                const outgoing = edges.filter((e) => e.sourceNodeId === startNodeId);
                if (outgoing.length > 0) {
                    const next = pickRandom(outgoing);
                    unit.edgeId = next.id;
                    unit.distanceOnEdge = 0;
                    unit.pathQueue = [next.targetNodeId];
                }
            }
        }
    }
}
