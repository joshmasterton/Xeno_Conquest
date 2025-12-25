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

  // CASE A: Move to Node (legacy)
  if (order.destNodeId) {
    const distToSource = unit.distanceOnEdge;
    const distToTarget = Math.max(0, currentEdge.length - unit.distanceOnEdge);

    const pathFromSource = findPath(edges, currentEdge.sourceNodeId, order.destNodeId);
    const pathFromTarget = findPath(edges, currentEdge.targetNodeId, order.destNodeId);

    const costViaSource = pathCost(pathFromSource, distToSource);
    const costViaTarget = pathCost(pathFromTarget, distToTarget);
    const useSource = costViaSource <= costViaTarget;
    const chosenPath = useSource ? pathFromSource : pathFromTarget;
    if (!chosenPath || chosenPath.length < 1) return;

    if (chosenPath.length === 1) {
      const destNode = chosenPath[0];
      if (destNode === currentEdge.targetNodeId) {
        unit.edgeId = currentEdge.id;
        unit.pathQueue = [currentEdge.targetNodeId];
        unit.targetEdgeId = null;
        unit.targetPercent = null;
        return;
      } else if (destNode === currentEdge.sourceNodeId) {
        const reverseEdge = edges.find(
          (e) => e.sourceNodeId === currentEdge.targetNodeId && e.targetNodeId === currentEdge.sourceNodeId
        );
        if (reverseEdge) {
          unit.edgeId = reverseEdge.id;
          unit.distanceOnEdge = currentEdge.length - unit.distanceOnEdge;
        }
        unit.pathQueue = [currentEdge.sourceNodeId];
        unit.targetEdgeId = null;
        unit.targetPercent = null;
        return;
      }
      unit.pathQueue = [destNode];
      unit.targetEdgeId = null;
      unit.targetPercent = null;
      return;
    }

    if (!useSource) {
      unit.edgeId = currentEdge.id;
      unit.pathQueue = chosenPath.slice(1);
      unit.targetEdgeId = null;
      unit.targetPercent = null;
      return;
    }

    const reverseEdge = edges.find(
      (e) => e.sourceNodeId === currentEdge.targetNodeId && e.targetNodeId === currentEdge.sourceNodeId
    );
    if (reverseEdge) {
      unit.edgeId = reverseEdge.id;
      unit.distanceOnEdge = currentEdge.length - unit.distanceOnEdge;
      unit.pathQueue = chosenPath.slice(1);
      unit.targetEdgeId = null;
      unit.targetPercent = null;
      return;
    }
    unit.pathQueue = chosenPath.slice(1);
    unit.targetEdgeId = null;
    unit.targetPercent = null;
    return;
  }

  // CASE B: Move to an edge position
  if (order.targetEdgeId && order.targetPercent !== undefined) {
    const targetEdge = edges.find((e) => e.id === order.targetEdgeId);
    if (!targetEdge) return;

    const distToSource = unit.distanceOnEdge;
    const distToTarget = Math.max(0, currentEdge.length - unit.distanceOnEdge);
    const pathToSource = findPath(edges, currentEdge.sourceNodeId, targetEdge.sourceNodeId);
    const pathToTarget = findPath(edges, currentEdge.targetNodeId, targetEdge.targetNodeId);

    const costViaSource = pathCost(pathToSource, distToSource);
    const costViaTarget = pathCost(pathToTarget, distToTarget);
    const approachFromSource = costViaSource <= costViaTarget;
    const chosenPath = approachFromSource ? pathToSource : pathToTarget;
    if (!chosenPath || chosenPath.length < 1) return;

    // Maintain current edge if approaching from its target side
    if (!approachFromSource) {
      unit.edgeId = currentEdge.id;
      unit.pathQueue = chosenPath.slice(1);
      // Append step onto target edge toward its source (approach from target side)
      unit.pathQueue.push(targetEdge.sourceNodeId);
    } else {
      const reverseEdge = edges.find(
        (e) => e.sourceNodeId === currentEdge.targetNodeId && e.targetNodeId === currentEdge.sourceNodeId
      );
      if (reverseEdge) {
        unit.edgeId = reverseEdge.id;
        unit.distanceOnEdge = currentEdge.length - unit.distanceOnEdge;
      }
      unit.pathQueue = chosenPath.slice(1);
      // Append step onto target edge toward its target (approach from source side)
      unit.pathQueue.push(targetEdge.targetNodeId);
    }

    unit.targetEdgeId = targetEdge.id;
    unit.targetPercent = approachFromSource ? order.targetPercent : (1 - (order.targetPercent ?? 0));
  }
}
