import type { WorldGraph } from '../types/world';
/**
 * Resolve a province id to a valid road node id, or null if unmapped.
 */
export declare function ensureProvinceNodeId(provinceId: string, graph?: WorldGraph): string | null;
