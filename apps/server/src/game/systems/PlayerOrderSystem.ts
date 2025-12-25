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
    if (path.length === 1) return initialCost;
    let cost = initialCost;
    for (let i = 0; i < path.length - 1; i++) {
      const e = edgeForStep(edges, path[i], path[i + 1]);
      if (!e) return Number.POSITIVE_INFINITY;
      cost += e.length;
    }
    return cost;
  };

  // --------------------------------------------------------------------------
  // CASE A: Move to Node (Standard Travel)
  // --------------------------------------------------------------------------
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

    // U-Turn if we chose Source (reverse direction)
    if (useSource) {
      const reverseEdge = edges.find(
        (e) => e.sourceNodeId === currentEdge.targetNodeId && e.targetNodeId === currentEdge.sourceNodeId
      );
      if (reverseEdge) {
        unit.edgeId = reverseEdge.id;
        unit.distanceOnEdge = currentEdge.length - unit.distanceOnEdge;
      }
    }

    unit.pathQueue = chosenPath.slice(1);
    unit.targetEdgeId = null;
    unit.targetPercent = null;
    return;
  }

  // --------------------------------------------------------------------------
  // CASE B: Move to Edge Point (Supremacy Style Stop + Backtrack)
  // --------------------------------------------------------------------------
  if (order.targetEdgeId && order.targetPercent !== undefined) {
    const requestedEdge = edges.find((e) => e.id === order.targetEdgeId);
    if (!requestedEdge) return;

    // Are we on the same road (either direction)?
    const isSameRoad =
      requestedEdge.id === currentEdge.id ||
      (requestedEdge.sourceNodeId === currentEdge.targetNodeId &&
        requestedEdge.targetNodeId === currentEdge.sourceNodeId);

    let approachFromSource = false;

    if (isSameRoad) {
      const currentPercent = currentEdge.length > 0 ? unit.distanceOnEdge / currentEdge.length : 0;
      let normalizedTarget = order.targetPercent;
      if (requestedEdge.id !== currentEdge.id) {
        // User clicked reverse direction relative to our current edge
        normalizedTarget = 1.0 - order.targetPercent;
      }

      if (normalizedTarget >= currentPercent) {
        // Target ahead → keep forward edge orientation
        approachFromSource = requestedEdge.id === currentEdge.id;
      } else {
        // Target behind → U-turn (flip orientation)
        approachFromSource = requestedEdge.id !== currentEdge.id;
      }
    } else {
      // Calculate approach side based on path costs to requested edge's ends
      const distToSource = unit.distanceOnEdge;
      const distToTarget = Math.max(0, currentEdge.length - unit.distanceOnEdge);

      const pathToEdgeSource = findPath(edges, currentEdge.sourceNodeId, requestedEdge.sourceNodeId);
      const pathToEdgeTarget = findPath(edges, currentEdge.targetNodeId, requestedEdge.targetNodeId);

      const costViaSource = pathCost(pathToEdgeSource, distToSource);
      const costViaTarget = pathCost(pathToEdgeTarget, distToTarget);
      approachFromSource = costViaSource <= costViaTarget;
    }

    // Build path to the edge entry
    let chosenPath: string[] | null = null;
    if (approachFromSource) {
      chosenPath = findPath(edges, currentEdge.sourceNodeId, requestedEdge.sourceNodeId);
    } else {
      chosenPath = findPath(edges, currentEdge.targetNodeId, requestedEdge.targetNodeId);
    }
    if (!chosenPath) return;

    // Immediate U-turn when starting from current edge's source but we're facing target
    if (chosenPath[0] === currentEdge.sourceNodeId) {
      const reverseEdge = edges.find(
        (e) => e.sourceNodeId === currentEdge.targetNodeId && e.targetNodeId === currentEdge.sourceNodeId
      );
      if (reverseEdge) {
        unit.edgeId = reverseEdge.id;
        unit.distanceOnEdge = currentEdge.length - unit.distanceOnEdge;
      }
    }

    unit.pathQueue = chosenPath.slice(1);

    // Finalize target on correct directional edge
    if (approachFromSource) {
      // Enter requestedEdge (A->B)
      unit.pathQueue.push(requestedEdge.targetNodeId);
      unit.targetEdgeId = requestedEdge.id;
      unit.targetPercent = order.targetPercent;
    } else {
      // Enter reverse of requestedEdge (B->A)
      const reverseTarget = edges.find(
        (e) => e.sourceNodeId === requestedEdge.targetNodeId && e.targetNodeId === requestedEdge.sourceNodeId
      );
      if (reverseTarget) {
        unit.pathQueue.push(reverseTarget.targetNodeId);
        unit.targetEdgeId = reverseTarget.id;
        unit.targetPercent = 1.0 - (order.targetPercent ?? 0);
      }
    }
  }
}
