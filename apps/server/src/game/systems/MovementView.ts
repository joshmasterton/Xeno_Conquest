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
  const endNode = nodesById.get(edge.targetNodeId);
  if (!endNode) return null;
  const remaining = Math.max(0, edge.length - unit.distanceOnEdge);
  const durationMs = unit.speed > 0 ? (remaining / unit.speed) * 1000 : 0;
  return {
    unitId: unit.id,
    edgeId: edge.id,
    start,
    end: { x: endNode.x, y: endNode.y },
    startTime: now,
    durationMs,
  };
}
