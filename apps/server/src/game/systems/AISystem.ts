import type { Unit, RoadEdge, RoadNode } from '@xeno/shared';
import { UNIT_BASE_SPEED } from '@xeno/shared';
import { findPath, edgeForStep } from './Pathing';

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
			hp: 100,
			maxHp: 100,
			state: 'IDLE',
			ownerId: 'ai_neutral',
			count: 1,
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
	const perBase = Math.max(1, Math.ceil(count / Math.max(1, baseNodeIds.length)));
	let uid = 1;
	for (const baseId of baseNodeIds) {
		const outgoing = edges.filter((e) => e.sourceNodeId === baseId);
		const fallbackIncoming = edges.filter((e) => e.targetNodeId === baseId);
		for (let i = 0; i < perBase && uid <= count; i++, uid++) {
			let startEdge: RoadEdge | undefined = outgoing[0];
			let startNodeId = baseId;
			if (!startEdge && fallbackIncoming[0]) {
				const inc = fallbackIncoming[0];
				startEdge = edges.find(
					(e) => e.sourceNodeId === baseId && e.targetNodeId === inc.sourceNodeId
				) || inc;
			}
			if (!startEdge) {
				startEdge = edges[0];
				startNodeId = startEdge.sourceNodeId;
			}

			let endNodeId = nodes[Math.floor(Math.random() * nodes.length)].id;
			let path = findPath(edges, startNodeId, endNodeId);
			for (let attempts = 0; attempts < 5 && (!path || path.length < 2); attempts++) {
				endNodeId = nodes[Math.floor(Math.random() * nodes.length)].id;
				if (endNodeId === startNodeId) continue;
				path = findPath(edges, startNodeId, endNodeId);
			}

			let edgeId = startEdge.id;
			let pathQueue: string[] | undefined = [startEdge.targetNodeId];
			if (path && path.length >= 2) {
				const firstStep = edgeForStep(edges, path[0], path[1]);
				if (firstStep) edgeId = firstStep.id;
				pathQueue = path.slice(1);
			}

			units.push({
				id: `ai-${uid}`,
				edgeId,
				distanceOnEdge: 0,
				speed: UNIT_BASE_SPEED,
				pathQueue,
				hp: 100,
				maxHp: 100,
				state: 'IDLE',
				ownerId: 'ai_neutral',
				count: 1,
			});
		}
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
		if (unit.ownerId && unit.ownerId !== 'ai_neutral') continue;
		
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
