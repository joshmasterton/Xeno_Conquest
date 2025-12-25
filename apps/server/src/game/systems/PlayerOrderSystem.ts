import type { Unit, RoadEdge, RoadNode, MoveOrder } from '@xeno/shared';
import { findPath, edgeForStep } from './Pathing';

export function processPlayerOrder(
  order: MoveOrder,
  units: Unit[],
  edges: RoadEdge[],
  nodes: RoadNode[]
): void {
  const unit = units.find((u) => u.id === order.unitId);
  if (!unit) return; // Unit not found

  const currentEdge = edges.find((e) => e.id === unit.edgeId);
  if (!currentEdge) return; // Edge not found

  // Evaluate both directions from the current edge position.
  const distToSource = unit.distanceOnEdge;
  const distToTarget = Math.max(0, currentEdge.length - unit.distanceOnEdge);

  const pathFromSource = findPath(edges, currentEdge.sourceNodeId, order.destNodeId);
  const pathFromTarget = findPath(edges, currentEdge.targetNodeId, order.destNodeId);

  const pathCost = (path: string[] | null, initialCost: number): number => {
    if (!path) return Number.POSITIVE_INFINITY;
    if (path.length === 1) return initialCost; // already there
    let cost = initialCost;
    for (let i = 0; i < path.length - 1; i++) {
      const e = edgeForStep(edges, path[i], path[i + 1]);
      if (!e) return Number.POSITIVE_INFINITY;
      cost += e.length;
    }
    return cost;
  };

  const costViaSource = pathCost(pathFromSource, distToSource);
  const costViaTarget = pathCost(pathFromTarget, distToTarget);

  const useSource = costViaSource <= costViaTarget;
  const chosenPath = useSource ? pathFromSource : pathFromTarget;
  if (!chosenPath || chosenPath.length < 1) return; // No path

  if (chosenPath.length === 1) {
    // Destination is the nearest endpoint of the current edge.
    const destNode = chosenPath[0];
    if (destNode === currentEdge.targetNodeId) {
      // Continue forward on current edge; ensure queue has the endpoint
      unit.edgeId = currentEdge.id;
      unit.pathQueue = [currentEdge.targetNodeId];
      return;
    } else if (destNode === currentEdge.sourceNodeId) {
      // Go backward: flip to reverse edge (if available) and queue the source endpoint
      const reverseEdge = edges.find(
        (e) => e.sourceNodeId === currentEdge.targetNodeId && e.targetNodeId === currentEdge.sourceNodeId
      );
      if (reverseEdge) {
        unit.edgeId = reverseEdge.id;
        unit.distanceOnEdge = currentEdge.length - unit.distanceOnEdge; // mirror position on reverse
      }
      unit.pathQueue = [currentEdge.sourceNodeId];
      return;
    }
    // Fallback: just set the single-node queue
    unit.pathQueue = [destNode];
    return;
  }

  // If choosing via current target, stay on current edge and keep distance
  if (!useSource) {
    unit.edgeId = currentEdge.id;
    unit.pathQueue = chosenPath.slice(1);
    return;
  }

  // Choosing via source: we need to travel back along the edge without snapping.
  const reverseEdge = edges.find(
    (e) => e.sourceNodeId === currentEdge.targetNodeId && e.targetNodeId === currentEdge.sourceNodeId
  );
  if (reverseEdge) {
    unit.edgeId = reverseEdge.id;
    unit.distanceOnEdge = currentEdge.length - unit.distanceOnEdge; // mirror position on reverse edge
    unit.pathQueue = chosenPath.slice(1);
    return;
  }

  // Fallback: if no reverse edge exists, stay on current edge and keep distance
  unit.pathQueue = chosenPath.slice(1);
}
