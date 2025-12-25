import { RoadEdge, Unit } from '@xeno/shared';

export function updateUnitPosition(
	unit: Unit,
	edge: RoadEdge,
	allEdges: RoadEdge[],
	deltaTime: number
): Unit {
	// Only move if unit has a destination in pathQueue
	if (!unit.pathQueue || unit.pathQueue.length === 0) {
		return unit; // Idle; don't move
	}

	unit.distanceOnEdge += unit.speed * deltaTime;

	let currentEdge = edge;
	// Consume overshoot across edges following the pathQueue deterministically
	while (unit.distanceOnEdge >= currentEdge.length) {
		const excess = unit.distanceOnEdge - currentEdge.length;
		const atNodeId = currentEdge.targetNodeId;

		// If we arrived at the head of the queue, pop it
		if (unit.pathQueue && unit.pathQueue.length > 0 && unit.pathQueue[0] === atNodeId) {
			unit.pathQueue.shift();
		}

		// If no more steps, clamp at the end of the edge
		if (!unit.pathQueue || unit.pathQueue.length === 0) {
			unit.distanceOnEdge = currentEdge.length;
			return unit;
		}

		// Determine the deterministic next edge to the next target node in queue
		const nextTargetNodeId = unit.pathQueue[0];
		const nextEdge = allEdges.find(
			(e) => e.sourceNodeId === atNodeId && e.targetNodeId === nextTargetNodeId
		);

		if (!nextEdge) {
			// Path invalid or broken; stop at current node
			unit.distanceOnEdge = currentEdge.length;
			return unit;
		}

		unit.edgeId = nextEdge.id;
		unit.distanceOnEdge = excess;
		currentEdge = nextEdge;
	}

	return unit;
}
