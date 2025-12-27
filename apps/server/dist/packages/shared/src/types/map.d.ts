import type { PlayerResources } from '@xeno/shared';
export interface RoadNode {
    id: string;
    x: number;
    y: number;
    ownerId?: string | null;
    resourceYield?: Partial<PlayerResources>;
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
    pathQueue?: string[];
    hp: number;
    maxHp: number;
    ownerId: string;
    state: 'MOVING' | 'IDLE' | 'COMBAT';
    combatTargetId?: string | null;
    count: number;
    targetEdgeId?: string | null;
    targetPercent?: number | null;
}
export interface Territory {
    id: string;
    x: number;
    y: number;
    pixelCount: number;
    neighbors: string[];
    radius: number;
    isWater?: boolean;
    contours?: [number, number][][];
    resources?: {
        [key: string]: number;
    };
}
