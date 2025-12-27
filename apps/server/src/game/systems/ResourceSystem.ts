import type { PlayerResources, RoadNode } from '@xeno/shared';

function addYield(target: PlayerResources, yieldPart?: Partial<PlayerResources>): void {
	if (!yieldPart) return;
	target.gold += yieldPart.gold ?? 0;
	target.manpower += yieldPart.manpower ?? 0;
}

export function processResources(nodes: RoadNode[], playerStates: Map<string, PlayerResources>): void {
	// Reset tallies before accumulation
	for (const [key, value] of playerStates) {
		value.gold = 0;
		value.manpower = 0;
	}

	for (const node of nodes) {
		if (!node.ownerId) continue;
		const existing = playerStates.get(node.ownerId) ?? { gold: 0, manpower: 0 };
		addYield(existing, node.resourceYield);
		playerStates.set(node.ownerId, existing);
	}
}
