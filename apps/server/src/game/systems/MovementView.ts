import type { Unit, RoadEdge, RoadNode, MovementSegment } from '@xeno/shared';

export function getUnitEdgePosition(
  unit: Unit,
  edge: RoadEdge,
  nodesById: Map<string, RoadNode>
): { x: number; y: number } {
  const start = nodesById.get(edge.sourceNodeId);
  const end = nodesById.get(edge.targetNodeId);
  if (!start || !end) return { x: 0, y: 0 };
  const t = Math.min(1, Math.max(0, unit.distanceOnEdge / edge.length));
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
}

export function buildSegment(
  now: number,
  unit: Unit,
  edge: RoadEdge,
  nodesById: Map<string, RoadNode>
): MovementSegment | null {
  const start = getUnitEdgePosition(unit, edge, nodesById);
  const remaining = Math.max(0, edge.length - unit.distanceOnEdge);
  const durationMsToEnd = unit.speed > 0 ? (remaining / unit.speed) * 1000 : 0;

  // If we're moving on a target edge with a stop point, aim segment at stop
  if (unit.targetEdgeId && unit.targetPercent != null && unit.edgeId === unit.targetEdgeId) {
    const endXNode = nodesById.get(edge.sourceNodeId);
    const endYNode = nodesById.get(edge.targetNodeId);
    if (!endXNode || !endYNode) return null;
    const stopDistance = Math.max(0, Math.min(edge.length, edge.length * unit.targetPercent));
    const t = stopDistance / edge.length;
    const end = { x: endXNode.x + (endYNode.x - endXNode.x) * t, y: endXNode.y + (endYNode.y - endXNode.y) * t };
    const remainingToStop = Math.max(0, stopDistance - unit.distanceOnEdge);
    const durationMs = unit.speed > 0 ? (remainingToStop / unit.speed) * 1000 : 0;
    return { unitId: unit.id, edgeId: edge.id, start, end, startTime: now, durationMs };
  }

  const endNode = nodesById.get(edge.targetNodeId);
  if (!endNode) return null;
  return {
    unitId: unit.id,
    edgeId: edge.id,
    start,
    end: { x: endNode.x, y: endNode.y },
    startTime: now,
    durationMs: durationMsToEnd,
  };
}
