"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processConquest = processConquest;
const shared_1 = require("@xeno/shared");
function createBidirectionalEdges(edges) {
    const key = (a, b) => `${a}->${b}`;
    const seen = new Set(edges.map((e) => key(e.sourceNodeId, e.targetNodeId)));
    const result = [...edges];
    for (const edge of edges) {
        const reverseKey = key(edge.targetNodeId, edge.sourceNodeId);
        if (!seen.has(reverseKey)) {
            seen.add(reverseKey);
            result.push({
                ...edge,
                id: `${edge.id}__rev`,
                sourceNodeId: edge.targetNodeId,
                targetNodeId: edge.sourceNodeId,
            });
        }
    }
    return result;
}
const edgesById = new Map(createBidirectionalEdges(shared_1.worldGraph.edges).map((edge) => [edge.id, edge]));
function processConquest(units, nodes) {
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    let captured = false;
    for (const unit of units) {
        const edge = edgesById.get(unit.edgeId);
        if (!edge)
            continue;
        const atStart = unit.distanceOnEdge <= 0;
        const atEnd = unit.distanceOnEdge >= edge.length;
        if (!atStart && !atEnd)
            continue;
        const nodeId = atStart ? edge.sourceNodeId : edge.targetNodeId;
        const node = nodesById.get(nodeId);
        if (!node)
            continue;
        if (node.ownerId === unit.ownerId)
            continue;
        node.ownerId = unit.ownerId ?? null;
        captured = true;
        console.log(`Node ${node.id} captured by ${unit.ownerId}`);
    }
    return captured;
}
