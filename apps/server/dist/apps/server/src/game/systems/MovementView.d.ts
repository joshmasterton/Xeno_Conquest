import type { Unit, RoadEdge, RoadNode, MovementSegment } from '@xeno/shared';
export declare function getUnitEdgePosition(unit: Unit, edge: RoadEdge, nodesById: Map<string, RoadNode>): {
    x: number;
    y: number;
};
export declare function buildSegment(now: number, unit: Unit, edge: RoadEdge, nodesById: Map<string, RoadNode>): MovementSegment | null;
