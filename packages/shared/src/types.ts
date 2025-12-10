export interface Point {
  x: number;
  y: number;
}

export interface Territory {
  id: string;
  name: string;
  centroid: Point;
  polygon: Point[]; // Primary/largest polygon
  polygons?: Point[][]; // All polygons including disconnected regions (optional for backwards compat)
  ownerId?: string;
  resourceRatePerHour?: number;
  terrainType?: 'highland' | 'plain' | 'lowland' | 'crater';
  elevation?: number;
}

export type UnitStatus = "IDLE" | "MOVING" | "COMBAT";

export interface Unit {
  id: string;
  ownerId: string;
  position: Point;
  destination?: Point;
  territoryId?: string;
  status: UnitStatus;
  speed: number; // units per second in world space
  count: number; // squad size aggregation
  health: number; // aggregated HP per squad
}

export interface MovementIntent {
  unitId: string;
  from: Point;
  to: Point;
  issuedAt: number; // epoch ms
  arrivalAt: number; // epoch ms
}

export interface MoveCommand {
  unitId: string;
  from: Point;
  to: Point;
  speed?: number; // optional override (world units per second)
}

export interface GameState {
  territories: Territory[];
  units: Unit[];
}

export interface MapSnapshot {
  territories: Territory[];
}
