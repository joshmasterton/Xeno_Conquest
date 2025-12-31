import type { Unit, RoadEdge, RoadNode } from '@xeno/shared';
import { UNIT_BASE_SPEED } from '@xeno/shared';
import { findPath, edgeForStep } from './Pathing';

const AI_TROOPS = 20;
const HP_PER_SOLDIER = 100;
const SPLIT_THRESHOLD = 30; // Larger stacks before splitting

// --------------------------------------------------------------------------
// 🧠 AI STATE & PERSONALITY
// --------------------------------------------------------------------------

type Personality = 'AGGRESSIVE' | 'EXPANSIONIST' | 'DEFENSIVE';

// Tracks when a unit is allowed to make a new decision
const unitDecisionTimers = new Map<string, number>();

function getPersonality(factionId: string): Personality {
	if (factionId.endsWith('_1')) return 'AGGRESSIVE';
	if (factionId.endsWith('_2')) return 'DEFENSIVE';
	return 'EXPANSIONIST';
}

function getDistance(a: RoadNode, b: RoadNode): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.sqrt(dx * dx + dy * dy);
}

function findBestTarget(
	unit: Unit,
	currentNode: RoadNode,
	nodes: RoadNode[],
	personality: Personality
): string | null {
	const myFaction = unit.ownerId;
	let candidates: RoadNode[] = [];

	if (personality === 'EXPANSIONIST') {
		candidates = nodes.filter((n) => n.ownerId === null || n.ownerId === undefined);
		if (candidates.length === 0) {
			candidates = nodes.filter((n) => n.ownerId && n.ownerId !== myFaction);
		}
	} else if (personality === 'AGGRESSIVE') {
		candidates = nodes.filter((n) => n.ownerId && n.ownerId !== myFaction);
	} else if (personality === 'DEFENSIVE') {
		candidates = nodes.filter((n) => n.ownerId === myFaction && n.id !== currentNode.id);
		if (candidates.length === 0) {
			candidates = nodes.filter((n) => !n.ownerId);
		}
	}

	if (candidates.length === 0) return null;

	let nearest: RoadNode | null = null;
	let minDist = Infinity;

	for (const cand of candidates) {
		const d = getDistance(currentNode, cand);
		if (d < minDist) {
			minDist = d;
			nearest = cand;
		}
	}

	return nearest ? nearest.id : null;
}

// --------------------------------------------------------------------------
// ⚙️ MAIN LOOP
// --------------------------------------------------------------------------

export function updateAIUnits(
	units: Unit[],
	edges: RoadEdge[],
	nodes: RoadNode[]
): void {
	const now = Date.now();
	const nodesById = new Map(nodes.map((n) => [n.id, n] as const));

	for (let i = units.length - 1; i >= 0; i--) {
		const unit = units[i];

		if (!unit.ownerId || unit.ownerId.startsWith('player')) continue;
		if (unit.state === 'COMBAT') continue;
		if (unit.state === 'MOVING' && unit.pathQueue && unit.pathQueue.length > 0) continue;

		const currentEdge = edges.find((e) => e.id === unit.edgeId);
		if (!currentEdge) continue;

		const arrivedAtEnd = unit.distanceOnEdge >= currentEdge.length;
		const atStart = unit.distanceOnEdge <= 0;
		if (!arrivedAtEnd && !atStart) continue;

		const nextDecisionTime = unitDecisionTimers.get(unit.id) ?? 0;
		if (now < nextDecisionTime) continue;

		const currentNodeId = arrivedAtEnd ? currentEdge.targetNodeId : currentEdge.sourceNodeId;
		const currentNode = nodesById.get(currentNodeId);
		if (!currentNode) continue;

		const personality = getPersonality(unit.ownerId);

		// Too hurt to leave the node; rest for 30s
		const hpRatio = unit.hp / unit.maxHp;
		if (hpRatio < 0.5) {
			unitDecisionTimers.set(unit.id, now + 30000);
			continue;
		}

		// Garrison: real players pause between moves
		if (Math.random() < 0.3) {
			unitDecisionTimers.set(unit.id, now + 10000 + Math.random() * 20000);
			continue;
		}

		const targetNodeId = findBestTarget(unit, currentNode, nodes, personality);
		if (!targetNodeId) {
			unitDecisionTimers.set(unit.id, now + 5000);
			continue;
		}

		const shouldSplit = personality === 'EXPANSIONIST' && unit.count >= SPLIT_THRESHOLD;

		if (shouldSplit) {
			const childCount = Math.floor(unit.count / 2);
			if (childCount >= 5) {
				unit.count -= childCount;
				unit.hp = unit.count * HP_PER_SOLDIER;
				unit.maxHp = unit.count * HP_PER_SOLDIER;

				const path = findPath(edges, currentNodeId, targetNodeId);
				if (path && path.length >= 2) {
					const nextStep = edgeForStep(edges, path[0], path[1]);
					if (nextStep) {
						const newUnitId = `unit-${unit.ownerId}-${Date.now()}`;
						const child: Unit = {
							id: newUnitId,
							ownerId: unit.ownerId,
							edgeId: nextStep.id,
							distanceOnEdge: 0,
							speed: unit.speed ?? UNIT_BASE_SPEED,
							pathQueue: path.slice(1),
							state: 'MOVING',
							count: childCount,
							hp: childCount * HP_PER_SOLDIER,
							maxHp: childCount * HP_PER_SOLDIER,
						};
						units.push(child);
						unitDecisionTimers.set(newUnitId, now + 5000);
					}
				}
				unitDecisionTimers.set(unit.id, now + 20000);
				continue;
			}
		}

		const path = findPath(edges, currentNodeId, targetNodeId);
		if (path && path.length >= 2) {
			const nextStep = edgeForStep(edges, path[0], path[1]);
			if (nextStep) {
				unit.edgeId = nextStep.id;
				unit.distanceOnEdge = 0;
				unit.pathQueue = path.slice(1);
				unit.state = 'MOVING';
			}
		}

		unitDecisionTimers.set(unit.id, now + 8000 + Math.random() * 4000);
	}
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

		const startDelay = Math.random() * 5000;
		const uId = `unit-${factionId}-1`;
		units.push({
			id: uId,
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

		unitDecisionTimers.set(uId, Date.now() + startDelay);
		console.log(`🤖 AI ${factionId} (${getPersonality(factionId)}) spawned at ${baseId}`);
	}
	return units;
}

export function createAIUnits(count: number, edges: RoadEdge[], nodes: RoadNode[]) {
	return [];
}
