export interface Point {
    x: number;
    y: number;
}
export interface Territory {
    id: string;
    name: string;
    centroid: Point;
    polygon: Point[];
    ownerId?: string;
    resourceRatePerHour?: number;
}
export type UnitStatus = "IDLE" | "MOVING" | "COMBAT";
export interface Unit {
    id: string;
    ownerId: string;
    position: Point;
    destination?: Point;
    territoryId?: string;
    status: UnitStatus;
    speed: number;
    count: number;
    health: number;
}
export interface MovementIntent {
    unitId: string;
    from: Point;
    to: Point;
    issuedAt: number;
    arrivalAt: number;
}
export interface MoveCommand {
    unitId: string;
    from: Point;
    to: Point;
    speed?: number;
}
