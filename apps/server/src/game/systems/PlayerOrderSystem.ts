import type { Unit, RoadEdge, RoadNode, MoveOrder } from '@xeno/shared';
import { findPath, edgeForStep } from './Pathing';

// CONFIG: Movement Snapping (Supremacy Style)
// 0.05 = snaps to 5%, 10%, 15%...
// 0.10 = snaps to 10%, 20%...
const SNAP_STEP = 0.05;

export function processPlayerOrder(
  playerId: string,
  order: MoveOrder,
  units: Unit[],
  edges: RoadEdge[],
  nodes: RoadNode[]
): void {
  const unitIndex = units.findIndex((u) => u.id === order.unitId);
  if (unitIndex === -1) return;
  
  const unit = units[unitIndex];

  // SECURITY CHECK: Verify the player owns this unit
  if (unit.ownerId !== playerId) {
    console.warn(`WARNING: Player ${playerId} tried to move unit ${unit.id} belonging to ${unit.ownerId}`);
    return;
  }

  // Determine if this is a SPLIT or a FULL MOVE
  const moveAll = !order.splitCount || order.splitCount >= unit.count;

  if (moveAll) {
    // Move the whole stack
    applyMoveToUnit(unit, order, edges, nodes);
  } else {
    // SPLIT: Create garrison and expedition
    // 1. Reduce the garrison (stays behind)
    unit.count -= order.splitCount!;
    
    // 2. Create the expedition force (moving out)
    const newUnitId = `unit-${unit.ownerId}-${Date.now()}`;
    const newUnit: Unit = {
      ...unit,
      id: newUnitId,
      count: order.splitCount!,
      hp: order.splitCount! * 10, // 10 HP per soldier
      maxHp: order.splitCount! * 10,
      state: 'IDLE',
      pathQueue: [],
      edgeId: unit.edgeId,
      distanceOnEdge: unit.distanceOnEdge,
    };

    // 3. Command the new unit to move
    applyMoveToUnit(newUnit, order, edges, nodes);

    // 4. Add to world
    units.push(newUnit);
    
    console.log(`⑂ SPLIT: Unit ${unit.id} kept ${unit.count}, new Unit ${newUnit.id} took ${newUnit.count}`);
  }
}

function applyMoveToUnit(
  unit: Unit,
  order: MoveOrder,
  edges: RoadEdge[],
  nodes: RoadNode[]
): void {

  const currentEdge = edges.find((e) => e.id === unit.edgeId);
  if (!currentEdge) return;

  // ---------------------------------------------------------------------------
  // 1. DETERMINE DESTINATION (Point on an Edge)
  // ---------------------------------------------------------------------------
  let targetEdge: RoadEdge | undefined;
  let rawTargetPercent = 0;

  if (order.targetEdgeId && order.targetPercent !== undefined) {
    // User clicked a specific point on a road
    targetEdge = edges.find((e) => e.id === order.targetEdgeId);
    rawTargetPercent = order.targetPercent;
  } else if (order.destNodeId) {
    // User clicked a City Node (treat as 0% on a connected road)
    // We just pick the first road leaving that city to start the calc
    targetEdge = edges.find(e => e.sourceNodeId === order.destNodeId);
    rawTargetPercent = 0;
  }

  if (!targetEdge) return;

  // Apply Supremacy-style Snapping
  const clamped = Math.max(0, Math.min(1, rawTargetPercent));
  const targetPercent = Number((Math.round(clamped / SNAP_STEP) * SNAP_STEP).toFixed(2));

  // ---------------------------------------------------------------------------
  // 2. IDENTIFY THE 5 POSSIBLE PHYSICAL ROUTES
  // ---------------------------------------------------------------------------
  
  // Helper: Get physical distance of a path of nodes
  const getPathDist = (path: string[] | null) => {
    if (!path) return Infinity;
    let dist = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const e = edgeForStep(edges, path[i], path[i + 1]);
      dist += e ? e.length : Infinity;
    }
    return dist;
  };

  // Setup current position stats
  const curDistFromSource = unit.distanceOnEdge;
  const curDistFromTarget = currentEdge.length - unit.distanceOnEdge;
  
  // Setup target position stats
  const tgtDistFromSource = targetEdge.length * targetPercent;
  const tgtDistFromTarget = targetEdge.length * (1.0 - targetPercent);

  // OPTION 1: DIRECT (Only if on same physical road)
  // "Just walk there"
  let optionDirect = { cost: Infinity, path: [] as string[], reverse: false };
  
  const isSameRoad = (currentEdge.sourceNodeId === targetEdge.sourceNodeId && currentEdge.targetNodeId === targetEdge.targetNodeId) ||
                     (currentEdge.sourceNodeId === targetEdge.targetNodeId && currentEdge.targetNodeId === targetEdge.sourceNodeId);

  if (isSameRoad) {
    // Normalize target to OUR current orientation to measure distance
    const normalizedTarget = (currentEdge.sourceNodeId === targetEdge.sourceNodeId) 
      ? targetPercent 
      : (1.0 - targetPercent);
    
    const distToTravel = Math.abs((normalizedTarget * currentEdge.length) - unit.distanceOnEdge);
    
    optionDirect = { 
      cost: distToTravel, 
      path: [], // No path needed, we are there
      reverse: normalizedTarget < (unit.distanceOnEdge / currentEdge.length) // True if we need to flip U-turn
    };
  }

  // OPTION 2-5: GRAPH ROUTES (Leave via Left/Right -> Enter via Left/Right)
  const calculateRoute = (startNode: string, startCost: number, endNode: string, endCost: number) => {
    if (startNode === endNode) return { cost: startCost + endCost, path: [startNode] };
    const p = findPath(edges, startNode, endNode);
    return { cost: startCost + getPathDist(p) + endCost, path: p };
  };

  const routes = [
    // 1. Direct (Same Road)
    { ...optionDirect, type: 'DIRECT' },
    // 2. Leave via Source -> Enter via Source
    { ...calculateRoute(currentEdge.sourceNodeId, curDistFromSource, targetEdge.sourceNodeId, tgtDistFromSource), type: 'PATH', enterAt: 'SOURCE' },
    // 3. Leave via Source -> Enter via Target
    { ...calculateRoute(currentEdge.sourceNodeId, curDistFromSource, targetEdge.targetNodeId, tgtDistFromTarget), type: 'PATH', enterAt: 'TARGET' },
    // 4. Leave via Target -> Enter via Source
    { ...calculateRoute(currentEdge.targetNodeId, curDistFromTarget, targetEdge.sourceNodeId, tgtDistFromSource), type: 'PATH', enterAt: 'SOURCE' },
    // 5. Leave via Target -> Enter via Target
    { ...calculateRoute(currentEdge.targetNodeId, curDistFromTarget, targetEdge.targetNodeId, tgtDistFromTarget), type: 'PATH', enterAt: 'TARGET' },
  ];

  // ---------------------------------------------------------------------------
  // 3. EXECUTE THE SHORTEST
  // ---------------------------------------------------------------------------
  routes.sort((a, b) => a.cost - b.cost);
  const best = routes[0];

  if (best.cost === Infinity) return; // No path found

  if ((best as any).type === 'DIRECT') {
    // CASE: We are on the road. Just move.
    if ((best as any).reverse) {
      // "Go back 20%" -> Flip unit to reverse edge
      const reverseEdge = edges.find(e => e.sourceNodeId === currentEdge.targetNodeId && e.targetNodeId === currentEdge.sourceNodeId);
      if (reverseEdge) {
        unit.edgeId = reverseEdge.id;
        unit.distanceOnEdge = (1.0 - (unit.distanceOnEdge / currentEdge.length)) * currentEdge.length;
        unit.targetEdgeId = reverseEdge.id;
        
        // If we flip, target 70% becomes target 30%
        const normalizedTarget = (currentEdge.sourceNodeId === targetEdge.sourceNodeId) ? targetPercent : (1.0 - targetPercent);
        unit.targetPercent = 1.0 - normalizedTarget;
        unit.pathQueue = [reverseEdge.targetNodeId];
      }
    } else {
      // "Go forward 20%" -> Just drive
      unit.targetEdgeId = currentEdge.id;
      // If edges aligned, use targetPercent. If inverse, flip it.
      const normalizedTarget = (currentEdge.sourceNodeId === targetEdge.sourceNodeId) ? targetPercent : (1.0 - targetPercent);
      unit.targetPercent = normalizedTarget;
      unit.pathQueue = [currentEdge.targetNodeId];
    }
  } else {
    // CASE: Pathfinding
    // 1. Handle "Exit" (Do we need to U-Turn to leave?)
    const leavesViaSource = (best as any).path![0] === currentEdge.sourceNodeId;
    if (leavesViaSource) {
      const reverseEdge = edges.find(e => e.sourceNodeId === currentEdge.targetNodeId && e.targetNodeId === currentEdge.sourceNodeId);
      if (reverseEdge) {
        unit.edgeId = reverseEdge.id;
        unit.distanceOnEdge = currentEdge.length - unit.distanceOnEdge;
      }
    }

    // 2. Set Path
    unit.pathQueue = (best as any).path!.slice(1);

    // 3. Handle "Entry"
    // We must ensure the unit targets the correct edge ID so it stops
    if ((best as any).enterAt === 'SOURCE') {
      unit.targetEdgeId = targetEdge.id;
      unit.targetPercent = targetPercent;
      if (!unit.pathQueue) unit.pathQueue = [];
      unit.pathQueue.push(targetEdge.targetNodeId);
    } else {
        // Entering from Target -> Must use Reverse Edge to drive "Backwards" into it
        const reverseTarget = edges.find(e => e.sourceNodeId === targetEdge.targetNodeId && e.targetNodeId === targetEdge.sourceNodeId);
        if (reverseTarget) {
            unit.targetEdgeId = reverseTarget.id;
            unit.targetPercent = 1.0 - targetPercent;
        if (!unit.pathQueue) unit.pathQueue = [];
        unit.pathQueue.push(reverseTarget.targetNodeId);
        }
    }
  }
}
