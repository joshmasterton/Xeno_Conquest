import type { Unit } from '../types/map';
import type { RoadNode } from '../types/map';

export const EVENTS = {
  S_GAME_TICK: 'S_GAME_TICK',
  C_MOVE_ORDER: 'C_MOVE_ORDER',
  COMBAT_EVENT: 'COMBAT_EVENT',
} as const;

export interface MoveOrder {
  unitId: string;
  destNodeId: string;
}

export interface MovementSegment {
  unitId: string;
  edgeId: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  startTime: number; // ms epoch
  durationMs: number; // total duration in ms
}

export interface CombatPair {
  aId: string;
  bId: string;
}

export interface CombatEventPayload {
  pairs: CombatPair[];
  timestamp: number;
}

export interface ServerGameTick {
  units: Unit[]; // authoritative state
  segments: MovementSegment[]; // visual interpolation hints
  timestamp: number;
}

export interface ServerToClientEvents {
  [EVENTS.S_GAME_TICK]: (payload: ServerGameTick) => void;
  [EVENTS.COMBAT_EVENT]: (payload: CombatEventPayload) => void;
}

export interface ClientToServerEvents {
  [EVENTS.C_MOVE_ORDER]: (payload: MoveOrder) => void;
}
