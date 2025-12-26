import { RoadEdge, RoadNode, Unit, worldGraph } from '@xeno/shared';

function createBidirectionalEdges(edges: RoadEdge[]): RoadEdge[] {
	const key = (a: string, b: string) => `${a}->${b}`;
	const seen = new Set<string>(edges.map((e) => key(e.sourceNodeId, e.targetNodeId)));
	const result: RoadEdge[] = [...edges];
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

const edgesById = new Map<string, RoadEdge>(createBidirectionalEdges(worldGraph.edges).map((edge) => [edge.id, edge]));

export function processConquest(units: Unit[], nodes: RoadNode[]): boolean {
	const nodesById = new Map<string, RoadNode>(nodes.map((node) => [node.id, node]));
	let captured = false;

	for (const unit of units) {
		const edge = edgesById.get(unit.edgeId);
		if (!edge) continue;

		const atStart = unit.distanceOnEdge <= 0;
		const atEnd = unit.distanceOnEdge >= edge.length;
		if (!atStart && !atEnd) continue;

		const nodeId = atStart ? edge.sourceNodeId : edge.targetNodeId;
		const node = nodesById.get(nodeId);
		if (!node) continue;

		if (node.ownerId === unit.ownerId) continue;

		node.ownerId = unit.ownerId ?? null;
		captured = true;
		console.log(`Node ${node.id} captured by ${unit.ownerId}`);
	}

	return captured;
}
