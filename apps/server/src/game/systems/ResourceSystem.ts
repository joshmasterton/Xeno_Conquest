import type { PlayerResources, RoadNode } from '@xeno/shared';

// CONFIG
const MANPOWER_CAP = 1000;

function addYield(target: PlayerResources, yieldPart?: Partial<PlayerResources>): void {
	if (!yieldPart) return;
	target.gold += yieldPart.gold ?? 0;
	// ✅ CAP MANPOWER
	target.manpower = Math.min(
		target.manpower + (yieldPart.manpower ?? 0),
		MANPOWER_CAP
	);
}

export function processResources(nodes: RoadNode[], playerStates: Map<string, PlayerResources>): void {
	for (const node of nodes) {
		if (!node.ownerId) continue;
		
		if (!playerStates.has(node.ownerId)) {
			playerStates.set(node.ownerId, { gold: 0, manpower: 0 });
		}
		const existing = playerStates.get(node.ownerId)!;

		addYield(existing, node.resourceYield);
	}
}
