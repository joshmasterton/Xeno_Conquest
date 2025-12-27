import type { Unit, RoadEdge, RoadNode } from '@xeno/shared';
import type { CombatPair } from '@xeno/shared';
export declare function detectProximity(units: Unit[], edges: RoadEdge[], nodesById: Map<string, RoadNode>): CombatPair[];
