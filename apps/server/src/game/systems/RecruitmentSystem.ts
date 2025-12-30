import type { Unit, RoadNode, RoadEdge } from '@xeno/shared';
import { UNIT_BASE_SPEED } from '@xeno/shared';

// CONFIG
const RECRUIT_BATCH_SIZE = 1;
const HP_PER_SOLDIER = 100;
const MERGE_DIST_THRESHOLD = 5.0; // Allow merging if within 5 units of the node

export function processRecruitment(
  units: Unit[], 
  edges: RoadEdge[], 
  nodes: RoadNode[]
): void {
  const now = Date.now();
  const edgesById = new Map(edges.map(e => [e.id, e]));

  for (const node of nodes) {
    if (!node.ownerId) continue;

    // 1. SEARCH FOR EXISTING GARRISON
    // Find any friendly unit that is "at" this node (on any connected road)
    const existingGarrison = units.find(u => {
      if (u.ownerId !== node.ownerId) return false;
      
      // Check if unit is on an edge connected to this node
      const edge = edgesById.get(u.edgeId);
      if (!edge) return false;

      // Is it at the Start (Source) of an edge starting here?
      if (edge.sourceNodeId === node.id && u.distanceOnEdge <= MERGE_DIST_THRESHOLD) return true;
      
      // Is it at the End (Target) of an edge ending here?
      if (edge.targetNodeId === node.id && u.distanceOnEdge >= edge.length - MERGE_DIST_THRESHOLD) return true;

      return false;
    });

    if (existingGarrison) {
      // 2. REINFORCE EXISTING
      existingGarrison.count += RECRUIT_BATCH_SIZE;
      existingGarrison.hp += RECRUIT_BATCH_SIZE * HP_PER_SOLDIER;
      existingGarrison.maxHp += RECRUIT_BATCH_SIZE * HP_PER_SOLDIER;
    } else {
      // 3. SPAWN NEW (Fallback logic if empty)
      let spawnEdge = edges.find(e => e.sourceNodeId === node.id);
      let startDist = 0;

      if (!spawnEdge) {
          spawnEdge = edges.find(e => e.targetNodeId === node.id);
          if (spawnEdge) startDist = spawnEdge.length;
      }

      if (spawnEdge) {
        units.push({
          id: `garrison-${node.ownerId}-${node.id}-${now}`,
          ownerId: node.ownerId,
          edgeId: spawnEdge.id,
          distanceOnEdge: startDist,
          state: 'IDLE',
          pathQueue: [],
          speed: UNIT_BASE_SPEED,
          count: RECRUIT_BATCH_SIZE,
          hp: RECRUIT_BATCH_SIZE * HP_PER_SOLDIER,
          maxHp: RECRUIT_BATCH_SIZE * HP_PER_SOLDIER,
        });
      }
    }
  }
  
  console.log(`🪖 RECRUITMENT: Reinforcements arrived.`);
}

