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

// CONFIG: "Drive-By" capture tolerance (px)
// With UNIT_BASE_SPEED ~60px/sec and tick ~0.1s, a unit moves ~6px per tick.
// Using a 12px radius guarantees node capture even if the unit skips exactly over distance 0/edge.length.
const CAPTURE_RADIUS = 12.0;

export function processConquest(units: Unit[], nodes: RoadNode[]): boolean {
	const nodesById = new Map<string, RoadNode>(nodes.map((node) => [node.id, node]));
	let captured = false;

	for (const unit of units) {
		// Skip dead units
		if (unit.hp <= 0) continue;

		const edge = edgesById.get(unit.edgeId);
		if (!edge) continue;

		// Drive-by capture: proximity to start node
		if (unit.distanceOnEdge <= CAPTURE_RADIUS) {
			const node = nodesById.get(edge.sourceNodeId);
			if (node && node.ownerId !== unit.ownerId) {
				node.ownerId = unit.ownerId ?? null;
				captured = true;
				console.log(`🚩 Drive-By: Node ${node.id} captured by ${unit.ownerId}`);
			}
		}

		// Drive-by capture: proximity to end node
		if (unit.distanceOnEdge >= edge.length - CAPTURE_RADIUS) {
			const node = nodesById.get(edge.targetNodeId);
			if (node && node.ownerId !== unit.ownerId) {
				node.ownerId = unit.ownerId ?? null;
				captured = true;
				console.log(`🚩 Drive-By: Node ${node.id} captured by ${unit.ownerId}`);
			}
		}
	}

	return captured;
}
