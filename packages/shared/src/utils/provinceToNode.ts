import type { WorldGraph } from '../types/world';
import worldGraphJson from '../data/world-graph.json';

// Local default graph to avoid index import cycles
const defaultGraph = worldGraphJson as WorldGraph;
const nodeIdSet = new Set(defaultGraph.nodes.map((n) => n.id));

/**
 * Resolve a province id to a valid road node id, or null if unmapped.
 */
export function ensureProvinceNodeId(provinceId: string, graph: WorldGraph = defaultGraph): string | null {
	if (!provinceId) return null;
	const fromDefault = nodeIdSet.has(provinceId) ? provinceId : null;
	if (fromDefault) return fromDefault;
	const existsInGraph = graph.nodes.some((n) => n.id === provinceId);
	return existsInGraph ? provinceId : null;
}
