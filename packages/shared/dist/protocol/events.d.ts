import type { Unit } from '../types/map';
import type { RoadNode } from '../types/map';
import type { PlayerResources } from '../types/state';
export declare const EVENTS: {
    readonly S_GAME_TICK: "S_GAME_TICK";
    readonly C_MOVE_ORDER: "C_MOVE_ORDER";
    readonly C_BUILD_UNIT: "C_BUILD_UNIT";
    readonly COMBAT_EVENT: "COMBAT_EVENT";
    readonly UNIT_DEATH: "UNIT_DEATH";
    readonly S_UNIT_DEATH: "S_UNIT_DEATH";
};
export interface MoveOrder {
    unitId: string;
    destNodeId?: string;
    targetEdgeId?: string;
    targetPercent?: number;
    splitCount?: number;
}
export interface MovementSegment {
    unitId: string;
    edgeId: string;
    start: {
        x: number;
        y: number;
    };
    end: {
        x: number;
        y: number;
    };
    startTime: number;
    durationMs: number;
}
export interface BuildUnitPayload {
    nodeId: string;
    unitType: 'infantry';
}
export interface CombatPair {
    aId: string;
    bId: string;
}
export interface CombatEventPayload {
    pairs: CombatPair[];
    timestamp: number;
}
export interface UnitDeathPayload {
    unitIds: string[];
    timestamp: number;
}
export interface ServerGameTick {
    units: Unit[];
    segments: MovementSegment[];
    timestamp: number;
    nodes: RoadNode[];
    players: Record<string, PlayerResources>;
}
export interface ServerToClientEvents {
    [EVENTS.S_GAME_TICK]: (payload: ServerGameTick) => void;
    [EVENTS.COMBAT_EVENT]: (payload: CombatEventPayload) => void;
    [EVENTS.UNIT_DEATH]: (payload: UnitDeathPayload) => void;
    [EVENTS.S_UNIT_DEATH]: (payload: {
        unitId: string;
    }) => void;
}
export interface ClientToServerEvents {
    [EVENTS.C_MOVE_ORDER]: (payload: MoveOrder) => void;
    [EVENTS.C_BUILD_UNIT]: (payload: BuildUnitPayload) => void;
}
