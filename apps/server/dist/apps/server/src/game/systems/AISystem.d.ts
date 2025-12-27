import type { Unit, RoadEdge, RoadNode } from '@xeno/shared';
export declare function createAIUnits(count: number, edges: RoadEdge[], nodes: RoadNode[]): Unit[];
export declare function createAIUnitsFromBases(count: number, edges: RoadEdge[], nodes: RoadNode[], baseNodeIds: string[]): Unit[];
export declare function updateAIUnits(units: Unit[], edges: RoadEdge[], nodes: RoadNode[]): void;
