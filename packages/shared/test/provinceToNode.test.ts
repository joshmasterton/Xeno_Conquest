import assert from 'assert';
import provincesJson from '../src/data/provinces.json';
import worldGraphJson from '../src/data/world-graph.json';
import { ensureProvinceNodeId } from '../src/utils/provinceToNode';
import type { Territory } from '../src/types/map';
import type { WorldGraph } from '../src/types/world';

const provinces = provincesJson as unknown as Territory[];
const worldGraph = worldGraphJson as WorldGraph;

// All province ids should exist as node ids
const provinceIds = new Set(provinces.map((p) => p.id));
const nodeIds = new Set(worldGraph.nodes.map((n) => n.id));

for (const id of provinceIds) {
	assert(nodeIds.has(id), `Province id ${id} is missing from world graph nodes`);
}

// Resolver should return the same id for valid provinces
for (const id of provinceIds) {
	const resolved = ensureProvinceNodeId(id, worldGraph);
	assert.strictEqual(resolved, id, `Resolver failed to return node for ${id}`);
}

// Resolver should return null for unknown ids
const unknown = ensureProvinceNodeId('#unknown-province', worldGraph);
assert.strictEqual(unknown, null, 'Resolver should return null for unknown province id');

console.log('provinceToNode resolver tests passed');
