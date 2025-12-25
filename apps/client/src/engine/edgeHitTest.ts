import type { RoadEdge, RoadNode } from '@xeno/shared';

export interface EdgeHit {
  edge: RoadEdge;
  t: number; // 0..1 clamped projection position along the edge
  distance: number; // pixel distance from click to edge
}

export function findNearestEdge(
  edges: RoadEdge[],
  nodesById: Map<string, RoadNode>,
  x: number,
  y: number,
  threshold = 20
): EdgeHit | null {
  let best: EdgeHit | null = null;

  for (const edge of edges) {
    const start = nodesById.get(edge.sourceNodeId);
    const end = nodesById.get(edge.targetNodeId);
    if (!start || !end) continue;

    const A = x - start.x;
    const B = y - start.y;
    const C = end.x - start.x;
    const D = end.y - start.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    const param = lenSq !== 0 ? dot / lenSq : -1;
    const t = Math.max(0, Math.min(1, param));

    const xx = start.x + t * C;
    const yy = start.y + t * D;

    const dx = x - xx;
    const dy = y - yy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= threshold && (!best || dist < best.distance)) {
      best = { edge, t, distance: dist };
    }
  }

  return best;
}
