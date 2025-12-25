import { RoadEdge, Unit } from '@xeno/shared';

export function updateUnitPosition(
	unit: Unit,
	edge: RoadEdge,
	allEdges: RoadEdge[],
	deltaTime: number
): Unit {
	// Only move if unit has a destination in pathQueue
	if (!unit.pathQueue || unit.pathQueue.length === 0) {
		// Allow precise target stop even when no queued path (already on target edge)
		if (unit.targetEdgeId && unit.targetPercent != null && unit.edgeId === unit.targetEdgeId) {
			const stopDistance = edge.length * unit.targetPercent;
			if (unit.distanceOnEdge > stopDistance) {
				unit.distanceOnEdge = stopDistance;
			}
		}
		return unit; // Idle; don't move
	}

	unit.distanceOnEdge += unit.speed * deltaTime;

	// Stop condition: on target edge and crossing targetPercent
	if (unit.targetEdgeId && unit.targetPercent != null && unit.edgeId === unit.targetEdgeId) {
		const stopDistance = edge.length * unit.targetPercent;
		if (unit.distanceOnEdge >= stopDistance) {
			unit.distanceOnEdge = stopDistance;
			unit.pathQueue = []; // clear any remaining path to hold position
			return unit; // hard stop
		}
	}

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

		// If we just moved onto the target edge, enforce stop immediately
		if (unit.targetEdgeId && unit.targetPercent != null && currentEdge.id === unit.targetEdgeId) {
			const stopDistance = currentEdge.length * unit.targetPercent;
			if (unit.distanceOnEdge >= stopDistance) {
				unit.distanceOnEdge = stopDistance;
				unit.pathQueue = [];
				break;
			}
		}
	}

	// Post-traversal: if on target edge, re-check stop condition
	if (unit.targetEdgeId && unit.targetPercent != null && currentEdge.id === unit.targetEdgeId) {
		const stopDistance = currentEdge.length * unit.targetPercent;
		if (unit.distanceOnEdge >= stopDistance) {
			unit.distanceOnEdge = stopDistance;
			unit.pathQueue = [];
			return unit;
		}
	}

	return unit;
}
