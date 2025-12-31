import type { Unit, RoadEdge } from '@xeno/shared';

// Merge radius for stacking checks
const MERGE_THRESHOLD = 20.0;

export function processStacking(units: Unit[], edges: RoadEdge[]): string[] {
	const deadIds: string[] = [];
	const edgesById = new Map(edges.map(e => [e.id, e]));

	// Helper: Can this unit merge? 
	// YES if IDLE or COMBAT. 
	// NO if MOVING (prevents splitting glitches).
	function canMerge(u: Unit) {
		return u.state !== 'MOVING' && u.hp > 0;
	}

	// ---------------------------------------------------------
	// PASS 1: EDGE MERGING (Reinforcing a battle on a road)
	// ---------------------------------------------------------
	const unitsByEdge = new Map<string, Unit[]>();
	for (const u of units) {
		if (!canMerge(u)) continue;
		if (!unitsByEdge.has(u.edgeId)) unitsByEdge.set(u.edgeId, []);
		unitsByEdge.get(u.edgeId)!.push(u);
	}

	for (const [edgeId, list] of unitsByEdge) {
		if (list.length < 2) continue;
		// Sort by position
		list.sort((a, b) => a.distanceOnEdge - b.distanceOnEdge);

		for (let i = 0; i < list.length - 1; i++) {
			const u1 = list[i];
			const u2 = list[i + 1];

			if (u1.ownerId !== u2.ownerId) continue;
			if (u1.state === 'MOVING' || u2.state === 'MOVING') continue;

			// Check distance
			const dist = Math.abs(u1.distanceOnEdge - u2.distanceOnEdge);
			if (dist <= MERGE_THRESHOLD) {
				// MERGE
				u1.count = (u1.count || 1) + (u2.count || 1);
				u1.hp += u2.hp;
				u1.maxHp += u2.maxHp;
				// If one was fighting, the stack continues fighting
				if (u2.state === 'COMBAT') u1.state = 'COMBAT';

				u2.hp = 0;
				deadIds.push(u2.id);
				
				// Remove u2 from list to prevent double merging
				list.splice(i + 1, 1);
				i--;
			}
		}
	}

	// ---------------------------------------------------------
	// PASS 2: NODE MERGING (Reinforcing a battle at a city)
	// ---------------------------------------------------------
	const unitsByNode = new Map<string, Unit[]>();

	for (const u of units) {
		if (!canMerge(u)) continue;

		const edge = edgesById.get(u.edgeId);
		if (!edge) continue;

		let nodeId: string | null = null;
		
		// Check start of edge
		if (u.distanceOnEdge <= MERGE_THRESHOLD) nodeId = edge.sourceNodeId;
		// Check end of edge
		else if (u.distanceOnEdge >= edge.length - MERGE_THRESHOLD) nodeId = edge.targetNodeId;

		if (nodeId) {
			if (!unitsByNode.has(nodeId)) unitsByNode.set(nodeId, []);
			unitsByNode.get(nodeId)!.push(u);
		}
	}

	for (const [nodeId, list] of unitsByNode) {
		if (list.length < 2) continue;

		// Group by owner
		const unitsByOwner = new Map<string, Unit[]>();
		for (const u of list) {
			if (!unitsByOwner.has(u.ownerId)) unitsByOwner.set(u.ownerId, []);
			unitsByOwner.get(u.ownerId)!.push(u);
		}

		// Merge each owner's stack
		for (const [ownerId, ownerUnits] of unitsByOwner) {
			if (ownerUnits.length < 2) continue;

			const primary = ownerUnits[0];

			for (let i = 1; i < ownerUnits.length; i++) {
				const secondary = ownerUnits[i];
				if (secondary.hp <= 0) continue; // Skip if already merged in Pass 1

				// MERGE
				primary.count = (primary.count || 1) + (secondary.count || 1);
				primary.hp += secondary.hp;
				primary.maxHp += secondary.maxHp;
				if (secondary.state === 'COMBAT') primary.state = 'COMBAT';

				// KILL
				secondary.hp = 0;
				deadIds.push(secondary.id);
			}
		}
	}

	return deadIds;
}
