import type { RoadEdge } from '@xeno/shared';
export declare function buildAdjacency(edges: RoadEdge[]): Map<string, string[]>;
export declare function findPath(edges: RoadEdge[], startNodeId: string, endNodeId: string): string[] | null;
export declare function edgeForStep(edges: RoadEdge[], fromNodeId: string, toNodeId: string): RoadEdge | undefined;
