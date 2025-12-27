import type { Unit } from '../types/map';
import type { RoadNode } from '../types/map';
import type { PlayerResources } from '../types/state';

export const EVENTS = {
  S_GAME_TICK: 'S_GAME_TICK',
  C_MOVE_ORDER: 'C_MOVE_ORDER',
  C_BUILD_UNIT: 'C_BUILD_UNIT',
  COMBAT_EVENT: 'COMBAT_EVENT',
  UNIT_DEATH: 'UNIT_DEATH',
  S_UNIT_DEATH: 'S_UNIT_DEATH',
} as const;

export interface MoveOrder {
  unitId: string;
  destNodeId?: string; // Optional: legacy node destination
  targetEdgeId?: string; // Optional: precise edge to stop on
  targetPercent?: number; // Optional: 0..1 along the target edge
}

export interface MovementSegment {
  unitId: string;
  edgeId: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  startTime: number; // ms epoch
  durationMs: number; // total duration in ms
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
  units: Unit[]; // authoritative state
  segments: MovementSegment[]; // visual interpolation hints
  timestamp: number;
  nodes: RoadNode[];
  players: Record<string, PlayerResources>;
}

export interface ServerToClientEvents {
  [EVENTS.S_GAME_TICK]: (payload: ServerGameTick) => void;
  [EVENTS.COMBAT_EVENT]: (payload: CombatEventPayload) => void;
  [EVENTS.UNIT_DEATH]: (payload: UnitDeathPayload) => void;
  [EVENTS.S_UNIT_DEATH]: (payload: { unitId: string }) => void;
}

export interface ClientToServerEvents {
  [EVENTS.C_MOVE_ORDER]: (payload: MoveOrder) => void;
  [EVENTS.C_BUILD_UNIT]: (payload: BuildUnitPayload) => void;
}
