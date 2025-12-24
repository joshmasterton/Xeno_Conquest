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
}
