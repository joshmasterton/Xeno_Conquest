export interface RoadNode {
	id: string;
	x: number;
	y: number;
	ownerId?: string | null; // null means neutral
}

export interface RoadEdge {
	id: string;
	sourceNodeId: string;
	targetNodeId: string;
	length: number;
}

export interface Unit {
	id: string;
	edgeId: string;
	distanceOnEdge: number;
	speed: number;
	pathQueue?: string[]; // sequence of nodeIds to visit (next targets)
	hp: number;
	maxHp: number;
	ownerId: string; // 'ai' or playerId
	state: 'MOVING' | 'IDLE' | 'COMBAT';
	combatTargetId?: string | null; // unit id we are fighting

	// Precise stopping control (optional)
	targetEdgeId?: string | null;
	targetPercent?: number | null; // 0..1 distance along target edge
}

export interface Territory {
	id: string; // hex color id (matches RoadNode.id)
	x: number; // centroid x
	y: number; // centroid y
	pixelCount: number; // area in pixels
	neighbors: string[]; // adjacent territory ids
	radius: number; // approximate radius for macro rendering
	isWater?: boolean; // true if marked as water by mask
	// Multiple polygon contours outlining province islands (image/world coords)
	contours?: [number, number][][];
	resources?: { [key: string]: number }; // optional resource values
}
