// packages/shared/src/config/factions.ts

export interface Faction {
	id: string;
	color: number;
	name: string;
	type: 'HUMAN' | 'AI' | 'NEUTRAL';
}

// A palette of distinct colors for dynamic assignment
export const FACTION_PALETTE = [
	0x3388ff, // Player Blue
	0xff3333, // Aggressive Red
	0x33ff33, // Toxic Green
	0xffaa00, // Empire Gold
	0xcc33ff, // Cult Purple
	0x00ffff, // Cyber Cyan
	0xffffff, // Neutral White
];

// Hash-based color assignment for dynamic faction IDs
export function getFactionColor(ownerId: string | null | undefined): number {
	if (!ownerId) return 0x555555; // Unoccupied Grey
	if (ownerId === 'ai_neutral') return 0x999999; // Generic Neutral AI

	// Hash the string to pick a consistent color from the palette
	let hash = 0;
	for (let i = 0; i < ownerId.length; i++) {
		hash = ownerId.charCodeAt(i) + ((hash << 5) - hash);
	}

	const index = Math.abs(hash) % FACTION_PALETTE.length;
	return FACTION_PALETTE[index];
}
