import { type CombatPair, type Unit } from '@xeno/shared';

// CONFIG: How much health does ONE soldier have?
const HP_PER_SOLDIER = 100;
// CONFIG: How much damage does ONE soldier deal per second?
const BASE_DPS = 25;

export function processCombat(units: Unit[], pairs: CombatPair[], deltaTime: number): void {
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

		const damageToA = (BASE_DPS * countB) * deltaTime;
		const damageToB = (BASE_DPS * countA) * deltaTime;

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
