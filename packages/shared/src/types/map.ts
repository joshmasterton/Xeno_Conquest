export interface RoadNode {
	id: string;
	x: number;
	y: number;
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
	ownerId?: string; // 'ai' or playerId; undefined = neutral
}

export interface Territory {
	id: string; // hex color id (matches RoadNode.id)
	x: number; // centroid x
	y: number; // centroid y
	pixelCount: number; // area in pixels
	neighbors: string[]; // adjacent territory ids
	radius: number; // approximate radius for macro rendering
	isWater?: boolean; // true if marked as water by mask
	// Optional polygon contour outlining the province border in image/world coords
	contour?: [number, number][];
	resources?: { [key: string]: number }; // optional resource values
}
