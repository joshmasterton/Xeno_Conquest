import { RoadEdge, Unit } from '@xeno/shared';

export function updateUnitPosition(
	unit: Unit,
	edge: RoadEdge,
	allEdges: RoadEdge[],
	deltaTime: number
): Unit {
	unit.distanceOnEdge += unit.speed * deltaTime;

	if (unit.distanceOnEdge >= edge.length) {
		const excess = unit.distanceOnEdge - edge.length;
		const targetNodeId = edge.targetNodeId;

		// Find valid next edges (connected to target node, but not the reverse)
		const validEdges = allEdges.filter(
			(e) => e.sourceNodeId === targetNodeId && e.id !== edge.id
		);

		if (validEdges.length > 0) {
			// Pick random edge
			const nextEdge = validEdges[Math.floor(Math.random() * validEdges.length)];
			unit.edgeId = nextEdge.id;
			unit.distanceOnEdge = excess;
		} else {
			// Dead end - clamp at edge end
			unit.distanceOnEdge = edge.length;
		}
	}

	return unit;
}
