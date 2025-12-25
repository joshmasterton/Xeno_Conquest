import type { RoadEdge } from '@xeno/shared';

export function buildAdjacency(edges: RoadEdge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.sourceNodeId)) adj.set(e.sourceNodeId, []);
    adj.get(e.sourceNodeId)!.push(e.targetNodeId);
  }
  return adj;
}

export function findPath(
  edges: RoadEdge[],
  startNodeId: string,
  endNodeId: string
): string[] | null {
  if (startNodeId === endNodeId) return [startNodeId];
  const adj = buildAdjacency(edges);
  const queue: string[] = [startNodeId];
  const visited = new Set<string>([startNodeId]);
  const parent = new Map<string, string | null>();
  parent.set(startNodeId, null);

  while (queue.length) {
    const current = queue.shift()!;
    const neighbors = adj.get(current) || [];
    for (const next of neighbors) {
      if (visited.has(next)) continue;
      visited.add(next);
      parent.set(next, current);
      if (next === endNodeId) {
        // Reconstruct path
        const path: string[] = [endNodeId];
        let p: string | null | undefined = endNodeId;
        while ((p = parent.get(p!) ?? null) !== null) path.push(p);
        path.reverse();
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

export function edgeForStep(edges: RoadEdge[], fromNodeId: string, toNodeId: string): RoadEdge | undefined {
  return edges.find(e => e.sourceNodeId === fromNodeId && e.targetNodeId === toNodeId);
}
