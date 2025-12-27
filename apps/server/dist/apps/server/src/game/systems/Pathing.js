"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAdjacency = buildAdjacency;
exports.findPath = findPath;
exports.edgeForStep = edgeForStep;
function buildAdjacency(edges) {
    const adj = new Map();
    for (const e of edges) {
        if (!adj.has(e.sourceNodeId))
            adj.set(e.sourceNodeId, []);
        adj.get(e.sourceNodeId).push(e.targetNodeId);
    }
    return adj;
}
function findPath(edges, startNodeId, endNodeId) {
    if (startNodeId === endNodeId)
        return [startNodeId];
    const adj = buildAdjacency(edges);
    const queue = [startNodeId];
    const visited = new Set([startNodeId]);
    const parent = new Map();
    parent.set(startNodeId, null);
    while (queue.length) {
        const current = queue.shift();
        const neighbors = adj.get(current) || [];
        for (const next of neighbors) {
            if (visited.has(next))
                continue;
            visited.add(next);
            parent.set(next, current);
            if (next === endNodeId) {
                // Reconstruct path
                const path = [endNodeId];
                let p = endNodeId;
                while ((p = parent.get(p) ?? null) !== null)
                    path.push(p);
                path.reverse();
                return path;
            }
            queue.push(next);
        }
    }
    return null;
}
function edgeForStep(edges, fromNodeId, toNodeId) {
    return edges.find(e => e.sourceNodeId === fromNodeId && e.targetNodeId === toNodeId);
}
