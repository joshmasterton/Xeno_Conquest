import type { Unit, RoadEdge, RoadNode } from '@xeno/shared';
import { UNIT_BASE_SPEED } from '@xeno/shared';
import { findPath, edgeForStep } from './Pathing';

const AI_TROOPS = 20;
const HP_PER_SOLDIER = 100;
const SPLIT_THRESHOLD = 15; // Army size that triggers a split

// --------------------------------------------------------------------------
// 🧠 AI STATE & PERSONALITY
// --------------------------------------------------------------------------

type Personality = 'AGGRESSIVE' | 'EXPANSIONIST' | 'DEFENSIVE' | 'RANDOM';

// Memory: Tracks when a unit is allowed to "think" again (prevents sync movement)
const unitCooldowns = new Map<string, number>();

function getPersonality(factionId: string): Personality {
	// Deterministic: map by faction suffix
	if (factionId.endsWith('_1')) return 'AGGRESSIVE';
	if (factionId.endsWith('_2')) return 'EXPANSIONIST';
	if (factionId.endsWith('_3')) return 'DEFENSIVE';
	return 'EXPANSIONIST';
}

function pickRandom<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

// Legacy random spawn function removed (use createAIUnitsFromBases instead)

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

		// Assign a random start delay so they don't all move at T=0
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

		// Initialize cooldown so they wait a bit before first move
		unitCooldowns.set(uId, Date.now() + startDelay);
		console.log(`🤖 AI ${factionId} (${getPersonality(factionId)}) spawned at ${baseId}`);
	}
	return units;
}

export function updateAIUnits(
	units: Unit[],
	edges: RoadEdge[],
	nodes: RoadNode[]
): void {
	const now = Date.now();

	// Iterate backwards since we may push new units
	for (let i = units.length - 1; i >= 0; i--) {
		const unit = units[i];

		// Security & validity
		if (!unit.ownerId || unit.ownerId.startsWith('player')) continue;
		if (unit.state === 'MOVING' && unit.pathQueue && unit.pathQueue.length > 0) continue;

		// Stagger check
		const readyTime = unitCooldowns.get(unit.id) ?? 0;
		if (now < readyTime) continue;
		// Reset cooldown (2–4s) to break synchronization
		unitCooldowns.set(unit.id, now + 2000 + Math.random() * 2000);

		// Context
		const currentEdge = edges.find((e) => e.id === unit.edgeId);
		if (!currentEdge) continue;
		const arrivedAtNode = unit.distanceOnEdge >= currentEdge.length;
		const hasNoPlan = !unit.pathQueue || unit.pathQueue.length === 0;
		const currentNodeId = arrivedAtNode ? currentEdge.targetNodeId : currentEdge.sourceNodeId;

		const personality = getPersonality(unit.ownerId);

		// Behavior: AGGRESSIVE
		if (personality === 'AGGRESSIVE') {
			if (Math.random() < 0.7) {
				moveRandomly(unit, currentNodeId, edges, nodes);
				continue;
			}
		}

		// Behavior: EXPANSIONIST (split & spread) — node-only split
		if (personality === 'EXPANSIONIST' && unit.count >= SPLIT_THRESHOLD && arrivedAtNode && hasNoPlan) {
			const outgoing = edges.filter((e) => e.sourceNodeId === currentNodeId);
			if (outgoing.length > 0) {
				const next = pickRandom(outgoing);
				const childCount = Math.floor(unit.count / 2);
				if (childCount > 0) {
					// Reduce parent stack and HP/maxHp proportionally to soldiers
					unit.count -= childCount;
					unit.hp = unit.count * HP_PER_SOLDIER;
					unit.maxHp = unit.count * HP_PER_SOLDIER;

					// Create expedition unit
					const newUnitId = `unit-${unit.ownerId}-${Date.now()}`;
					const child: Unit = {
						id: newUnitId,
						ownerId: unit.ownerId,
						edgeId: next.id,
						distanceOnEdge: 0,
						speed: unit.speed ?? UNIT_BASE_SPEED,
						pathQueue: [next.targetNodeId],
						state: 'IDLE',
						count: childCount,
						hp: childCount * HP_PER_SOLDIER,
						maxHp: childCount * HP_PER_SOLDIER,
					};
					units.push(child);
					// Child acts quickly
					unitCooldowns.set(newUnitId, now + 500);
				}
			}
			// Parent continues to plan below
		}

		// Behavior: DEFENSIVE (turtle)
		if (personality === 'DEFENSIVE') {
			if (Math.random() < 0.3) {
				moveRandomly(unit, currentNodeId, edges, nodes);
			}
			continue;
		}

		// Fallback: random wander
		moveRandomly(unit, currentNodeId, edges, nodes);
	}
}

// Helper for basic movement
function moveRandomly(unit: Unit, startNodeId: string, edges: RoadEdge[], nodes: RoadNode[]) {
	// Try to find a valid path to a random node
	let endNodeId = pickRandom(nodes).id;
	let path = findPath(edges, startNodeId, endNodeId);
	for (let attempts = 0; attempts < 3 && (!path || path.length < 2); attempts++) {
		endNodeId = pickRandom(nodes).id;
		if (endNodeId === startNodeId) continue;
		path = findPath(edges, startNodeId, endNodeId);
	}

	if (path && path.length >= 2) {
		const nextStep = edgeForStep(edges, path[0], path[1]);
		if (nextStep) {
			unit.edgeId = nextStep.id;
			unit.distanceOnEdge = 0;
			unit.pathQueue = path.slice(1);
			unit.state = 'MOVING';
		}
	} else {
		const outgoing = edges.filter((e) => e.sourceNodeId === startNodeId);
		if (outgoing.length > 0) {
			const next = pickRandom(outgoing);
			unit.edgeId = next.id;
			unit.distanceOnEdge = 0;
			unit.pathQueue = [next.targetNodeId];
			unit.state = 'MOVING';
		}
	}
}

// Keep export for legacy spawning if referenced elsewhere
export function createAIUnits(count: number, edges: RoadEdge[], nodes: RoadNode[]) {
	return [];
}
