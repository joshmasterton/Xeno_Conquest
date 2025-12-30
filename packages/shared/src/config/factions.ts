// packages/shared/src/config/factions.ts

export interface Faction {
	id: string;
	color: number;
	name: string;
	type: 'HUMAN' | 'AI' | 'NEUTRAL';
}

export const FACTION_PALETTE = [
	0x3388ff, // 0: Player Blue (Reserved)
	0xff3333, // 1: Aggressive Red
	0x33ff33, // 2: Toxic Green
	0xffaa00, // 3: Empire Gold
	0xcc33ff, // 4: Cult Purple
	0x00ffff, // 5: Cyber Cyan
	0xffffff, // 6: Neutral White
];

export function getFactionColor(ownerId: string | null | undefined): number {
	if (!ownerId) return 0x555555; // Grey (Unoccupied)
	if (ownerId === 'ai_neutral') return 0x999999; // Light Grey (Rebels)

	// 1. Force Human Player to always be BLUE (Index 0)
	if (ownerId.startsWith('player')) {
		return FACTION_PALETTE[0];
	}

	// 2. Force AI Factions to pick consistent unique colors
	const match = ownerId.match(/ai_faction_(\d+)/);
	if (match) {
		const factionIndex = parseInt(match[1], 10);
		const paletteIndex = 1 + ((factionIndex - 1) % (FACTION_PALETTE.length - 1));
		return FACTION_PALETTE[paletteIndex];
	}

	// 3. Fallback for unknown IDs (Hash)
	let hash = 0;
	for (let i = 0; i < ownerId.length; i++) {
		hash = ownerId.charCodeAt(i) + ((hash << 5) - hash);
	}
	return FACTION_PALETTE[Math.abs(hash) % FACTION_PALETTE.length];
}
