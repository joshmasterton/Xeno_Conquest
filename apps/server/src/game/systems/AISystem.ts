import type { Unit, RoadEdge, RoadNode } from '@xeno/shared';
import { UNIT_BASE_SPEED } from '@xeno/shared';
import { findPath, edgeForStep } from './Pathing';

const AI_TROOPS = 20;
const HP_PER_SOLDIER = 100;

function pickRandom<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

export function createAIUnits(
	count: number,
	edges: RoadEdge[],
	nodes: RoadNode[]
): Unit[] {
	const units: Unit[] = [];
	for (let i = 0; i < count; i++) {
		const edge = pickRandom(edges);
		const startNodeId = edge.sourceNodeId;
		let endNodeId = pickRandom(nodes).id;
		let path = findPath(edges, startNodeId, endNodeId);
		for (let attempts = 0; attempts < 5 && (!path || path.length < 2); attempts++) {
			endNodeId = pickRandom(nodes).id;
			if (endNodeId === startNodeId) continue;
			path = findPath(edges, startNodeId, endNodeId);
		}

		let edgeId = edge.id;
		let pathQueue: string[] | undefined = [edge.targetNodeId];
		if (path && path.length >= 2) {
			const firstStep = edgeForStep(edges, path[0], path[1]);
			if (firstStep) edgeId = firstStep.id;
			pathQueue = path.slice(1);
		}

		units.push({
			id: `ai-${i + 1}`,
			edgeId,
			distanceOnEdge: 0,
			speed: UNIT_BASE_SPEED,
			pathQueue,
			hp: AI_TROOPS * HP_PER_SOLDIER,
			maxHp: AI_TROOPS * HP_PER_SOLDIER,
			state: 'IDLE',
			ownerId: 'ai_neutral',
			count: AI_TROOPS,
		});
	}
	return units;
}

export function createAIUnitsFromBases(
	count: number,
	edges: RoadEdge[],
	nodes: RoadNode[],
	baseNodeIds: string[]
): Unit[] {
	const units: Unit[] = [];
	const basesToUse = baseNodeIds.slice(0, count);
	for (let i = 0; i < basesToUse.length; i++) {
		const baseId = basesToUse[i];
		const factionId = `ai_faction_${i + 1}`;

		const outgoing = edges.filter((e) => e.sourceNodeId === baseId);
		const incoming = edges.filter((e) => e.targetNodeId === baseId);

		let startEdge: RoadEdge | undefined = outgoing[0];
		if (!startEdge && incoming[0]) {
			startEdge = incoming[0];
		}
		if (!startEdge) {
			console.warn(`⚠️ AI Base ${baseId} is isolated (no roads). Army creation skipped.`);
			continue;
		}

		units.push({
			id: `unit-${factionId}-1`,
			edgeId: startEdge.id,
			distanceOnEdge: 0,
			speed: UNIT_BASE_SPEED,
			pathQueue: [],
			hp: AI_TROOPS * HP_PER_SOLDIER,
			maxHp: AI_TROOPS * HP_PER_SOLDIER,
			state: 'IDLE',
			ownerId: factionId,
			count: AI_TROOPS,
		});
		console.log(`🤖 AI ${factionId} spawned at ${baseId}`);
	}
	return units;
}

export function updateAIUnits(
	units: Unit[],
	edges: RoadEdge[],
	nodes: RoadNode[]
): void {
	const nodesById = new Map(nodes.map((n) => [n.id, n]));
	for (const unit of units) {
		// Only update units without a faction controller (ai_faction units are managed)
		if (unit.ownerId && unit.ownerId.startsWith('ai_faction')) continue;
		
		const currentEdge = edges.find((e) => e.id === unit.edgeId);
		if (!currentEdge) continue;
		
		const arrivedAtNode = unit.distanceOnEdge >= currentEdge.length;
		const hasNoPlan = !unit.pathQueue || unit.pathQueue.length === 0;
		
		if (arrivedAtNode && hasNoPlan) {
			const startNodeId = currentEdge.targetNodeId;
			let endNodeId = pickRandom(nodes).id;
			let path = findPath(edges, startNodeId, endNodeId);
			for (let attempts = 0; attempts < 5 && (!path || path.length < 2); attempts++) {
				endNodeId = pickRandom(nodes).id;
				if (endNodeId === startNodeId) continue;
				path = findPath(edges, startNodeId, endNodeId);
			}
			if (path && path.length >= 2) {
				const next = edgeForStep(edges, path[0], path[1]);
				if (next) {
					unit.edgeId = next.id;
					unit.distanceOnEdge = 0;
					unit.pathQueue = path.slice(1);
				}
			} else {
				const outgoing = edges.filter((e) => e.sourceNodeId === startNodeId);
				if (outgoing.length > 0) {
					const next = pickRandom(outgoing);
					unit.edgeId = next.id;
					unit.distanceOnEdge = 0;
					unit.pathQueue = [next.targetNodeId];
				}
			}
		}
	}
}
