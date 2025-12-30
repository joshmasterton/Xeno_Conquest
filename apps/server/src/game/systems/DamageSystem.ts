import { type CombatPair, type Unit, type RoadEdge, type RoadNode } from '@xeno/shared';

// CONFIG: How much health does ONE soldier have?
const HP_PER_SOLDIER = 100;
// CONFIG: How much damage does ONE soldier deal per second?
// Slowed for attrition-style combat (Supremacy-like pacing)
const BASE_DPS = 0.5;

// Helper to find if unit is at a node
function getUnitNodeId(unit: Unit, edges: RoadEdge[]): string | null {
	const edge = edges.find(e => e.id === unit.edgeId);
	if (!edge) return null;

	// Tolerance for being "at" the node
	const TOLERANCE = 5.0;

	if (unit.distanceOnEdge <= TOLERANCE) return edge.sourceNodeId;
	if (unit.distanceOnEdge >= edge.length - TOLERANCE) return edge.targetNodeId;

	return null;
}

export function processCombat(units: Unit[], pairs: CombatPair[], deltaTime: number, edges?: RoadEdge[], nodes?: RoadNode[]): void {
	if (!pairs.length) return;

	const unitsById = new Map<string, Unit>(units.map((u) => [u.id, u]));
	const fightingUnitIds = new Set<string>();

	for (const pair of pairs) {
		const unitA = unitsById.get(pair.aId);
		const unitB = unitsById.get(pair.bId);
		
		// Safety check: Ensure units exist and are alive
		if (!unitA || !unitB || unitA.hp <= 0 || unitB.hp <= 0) continue;

		unitA.state = 'COMBAT';
		unitB.state = 'COMBAT';
		fightingUnitIds.add(unitA.id);
		fightingUnitIds.add(unitB.id);

		// 1. Calculate Damage Output (Strength in Numbers)
		const countA = Math.max(1, unitA.count);
		const countB = Math.max(1, unitB.count);

		let damageToA = (BASE_DPS * countB) * deltaTime;
		let damageToB = (BASE_DPS * countA) * deltaTime;

		// FORTIFICATION BONUS: Check if units are standing on friendly fortified nodes
		if (edges && nodes) {
			const nodesById = new Map(nodes.map(n => [n.id, n]));

			// Unit A defending bonus
			const nodeA = getUnitNodeId(unitA, edges);
			if (nodeA) {
				const nodeDataA = nodesById.get(nodeA);
				if (nodeDataA && nodeDataA.ownerId === unitA.ownerId) {
					const level = nodeDataA.fortificationLevel ?? 1;
					const reductionPercent = Math.min(level * 0.10, 0.50);
					damageToA = damageToA * (1.0 - reductionPercent);
				}
			}

			// Unit B defending bonus
			const nodeB = getUnitNodeId(unitB, edges);
			if (nodeB) {
				const nodeDataB = nodesById.get(nodeB);
				if (nodeDataB && nodeDataB.ownerId === unitB.ownerId) {
					const level = nodeDataB.fortificationLevel ?? 1;
					const reductionPercent = Math.min(level * 0.10, 0.50);
					damageToB = damageToB * (1.0 - reductionPercent);
				}
			}
		}

		// 2. Apply Damage to the Shared HP Pool
		unitA.hp = Math.max(0, unitA.hp - damageToA);
		unitB.hp = Math.max(0, unitB.hp - damageToB);

		// 3. ATTRITION LOGIC: Update the Count
		// If HP drops, soldiers die one by one
		unitA.count = Math.ceil(unitA.hp / HP_PER_SOLDIER);
		unitB.count = Math.ceil(unitB.hp / HP_PER_SOLDIER);
	}

	for (const unit of units) {
		if (unit.state === 'COMBAT' && !fightingUnitIds.has(unit.id)) {
			const hasPath = !!(unit.pathQueue && unit.pathQueue.length > 0);
			unit.state = hasPath ? 'MOVING' : 'IDLE';
		}
	}
}
