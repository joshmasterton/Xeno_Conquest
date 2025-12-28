import { RoadEdge, Unit, worldGraph, TICK_RATE, EVENTS, BASE_NODE_IDS, type RoadNode, type MovementSegment, type MoveOrder, type PlayerResources } from '@xeno/shared';
import { updateUnitPosition } from './systems/MovementSystem';
import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@xeno/shared';
import { findPath, edgeForStep } from './systems/Pathing';
import { buildSegment, getUnitEdgePosition } from './systems/MovementView';
import { detectProximity } from './systems/CombatSystem';
import { createAIUnitsFromBases, updateAIUnits } from './systems/AISystem';
import { processPlayerOrder } from './systems/PlayerOrderSystem';
import { processCombat } from './systems/DamageSystem';
import { processConquest } from './systems/ConquestSystem';
import { processResources } from './systems/ResourceSystem';
import { processStacking } from './systems/StackingSystem';

const STARTING_TROOPS = 20;
const HP_PER_SOLDIER = 100;

function createBidirectionalEdges(edges: RoadEdge[]): RoadEdge[] {
	const key = (a: string, b: string) => `${a}->${b}`;
	const seen = new Set<string>(edges.map((e) => key(e.sourceNodeId, e.targetNodeId)));
	const result: RoadEdge[] = [...edges];
	for (const e of edges) {
		const reverseKey = key(e.targetNodeId, e.sourceNodeId);
		if (!seen.has(reverseKey)) {
			seen.add(reverseKey);
			result.push({ ...e, id: `${e.id}__rev`, sourceNodeId: e.targetNodeId, targetNodeId: e.sourceNodeId });
		}
	}
	return result;
}

export class GameLoop {
	private readonly units: Unit[];
	private readonly edges: RoadEdge[];
	private readonly edgesMap: Map<string, RoadEdge>; // ✅ O(1) lookup
	private readonly io: Server<ClientToServerEvents, ServerToClientEvents>;
	private readonly nodesById: Map<string, RoadNode>;
	private readonly playerStates: Map<string, PlayerResources> = new Map();
	private lastTick = Date.now();

	constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
		this.io = io;
		this.edges = createBidirectionalEdges(worldGraph.edges);
		this.edgesMap = new Map(this.edges.map((e) => [e.id, e])); // ✅ Build O(1) map
		this.nodesById = new Map(worldGraph.nodes.map((n) => [n.id, n]));
		console.log(`Loaded ${this.edges.length} edges from world graph.`);

		// Initialize players with zeroed resources
		this.playerStates.set('player-1', { gold: 0, manpower: 0 });

		// Supremacy spawn logic
		const playerBaseId = BASE_NODE_IDS[0];
		const aiBaseIds = BASE_NODE_IDS.slice(1);

		console.log(`🗺️ Map Setup: Player at ${playerBaseId}, AI at ${aiBaseIds.join(', ')}`);

		// Spawn player army at its base
		const pOutgoing = this.edges.filter((e) => e.sourceNodeId === playerBaseId);
		const pStartEdge = pOutgoing[0] ?? this.edges.find((e) => e.targetNodeId === playerBaseId);
		this.units = [];
		if (pStartEdge) {
			this.units.push({
				id: 'player-1-army',
				edgeId: pStartEdge.id,
				distanceOnEdge: 0,
				speed: 60,
				ownerId: 'player-1',
				pathQueue: [],
				state: 'IDLE',
				count: STARTING_TROOPS,
				hp: STARTING_TROOPS * HP_PER_SOLDIER,
				maxHp: STARTING_TROOPS * HP_PER_SOLDIER,
			});
			console.log(`✅ Player Army spawned at ${playerBaseId}`);
		} else {
			console.error(`❌ CRITICAL: Player Base ${playerBaseId} has no connected roads!`);
		}

		// Spawn one AI army per remaining base
		const aiUnits = createAIUnitsFromBases(aiBaseIds.length, this.edges, worldGraph.nodes, aiBaseIds);
		this.units.push(...aiUnits);

		// Listen for player move orders
		console.log('🔌 Setting up Socket.IO event listeners...');
		this.io.on('connection', (socket) => {
			console.log(`✅ Client connected: ${socket.id}`);
			const playerId = 'player-1';
			if (!this.playerStates.has(playerId)) {
				this.playerStates.set(playerId, { gold: 0, manpower: 0 });
			}
			socket.on(EVENTS.C_MOVE_ORDER, (order: MoveOrder) => {
				console.log(`📍 Order received: unit ${order.unitId} → node ${order.destNodeId}`);
				processPlayerOrder(order, this.units, this.edges, Array.from(this.nodesById.values()));
				const unit = this.units.find((u) => u.id === order.unitId);
				if (unit) {
					console.log(`✓ Unit updated: edgeId=${unit.edgeId}, pathQueue=[${unit.pathQueue?.join(', ') || 'empty'}]`);
				}
			});
			socket.on(EVENTS.C_BUILD_UNIT, (payload) => {
				const cost = 50;
				const player = this.playerStates.get(playerId);
				if (!player) return;

				const node = this.nodesById.get(payload.nodeId);
				if (!node || node.ownerId !== playerId) return;
				if (player.gold < cost) return;

				player.gold -= cost;
				this.playerStates.set(playerId, player);

				const outgoing = this.edges.filter((e) => e.sourceNodeId === payload.nodeId);
				const fallbackIncoming = this.edges.filter((e) => e.targetNodeId === payload.nodeId);
				const startEdge = outgoing[0] ?? fallbackIncoming[0] ?? this.edges[0];

				const unitId = `built-${playerId}-${Date.now()}`;
				this.units.push({
					id: unitId,
					edgeId: startEdge.id,
					distanceOnEdge: 0,
					speed: 60,
					ownerId: playerId,
					pathQueue: [],
					hp: STARTING_TROOPS * HP_PER_SOLDIER,
					maxHp: STARTING_TROOPS * HP_PER_SOLDIER,
					state: 'IDLE',
					count: STARTING_TROOPS,
				});
				console.log(`⚒️ Unit built by ${playerId} at node ${payload.nodeId}`);
			});
			socket.on('disconnect', () => {
				console.log(`❌ Client disconnected: ${socket.id}`);
			});
		});
	}

	start(): void {
		this.lastTick = Date.now();
		const RESOURCE_TICK_MS = 1000;
		setInterval(() => {
			processResources(Array.from(this.nodesById.values()), this.playerStates);
		}, RESOURCE_TICK_MS);

		setInterval(() => {
			const now = Date.now();
			const deltaTime = (now - this.lastTick) / 1000;
			this.lastTick = now;

			// Update unit positions
			for (const unit of this.units) {
				const edge = this.edgesMap.get(unit.edgeId); // ✅ O(1)
				if (!edge) continue;

				updateUnitPosition(unit, edge, this.edges, deltaTime);
				if (unit.id === 'player-1') {
					console.log(`🎮 player-1: distance=${unit.distanceOnEdge.toFixed(1)}/${edge.length}, pathQueue=[${unit.pathQueue?.join(', ') || 'empty'}]`);
				}
			}

			// Conquest
			const conquestOccurred = processConquest(this.units, Array.from(this.nodesById.values()));

			// Stacking: merge friendly overlapping units
			const absorbedIds = processStacking(this.units, this.edges);

			// Reassign paths for AI units that arrived with no pending plan
			updateAIUnits(this.units, this.edges, worldGraph.nodes);

			// Combat
			const pairs = detectProximity(this.units, this.edges, this.nodesById);
			processCombat(this.units, pairs, deltaTime);

			// Remove dead units immediately to avoid ghost targets
			const deadIds: string[] = [...absorbedIds];
			for (let i = this.units.length - 1; i >= 0; i--) {
				const unit = this.units[i];
				if (typeof unit.hp === 'number' && unit.hp <= 0) {
					if (!deadIds.includes(unit.id)) deadIds.push(unit.id);
					this.units.splice(i, 1);
				}
			}

			// Build interpolation/idle segments for visualization
			const segments: MovementSegment[] = [];
			for (const unit of this.units) {
				const edge = this.edgesMap.get(unit.edgeId); // ✅ O(1)
				if (!edge) continue;

				// FIX: If in COMBAT, force zero-duration segment to prevent shivering
				const isMoving = !!(unit.pathQueue && unit.pathQueue.length > 0) && unit.state !== 'COMBAT';
				if (isMoving) {
					const seg = buildSegment(now, unit, edge, this.nodesById);
					if (seg) segments.push(seg);
				} else {
					// Idle snapshot (Combat or Standing still) — zero duration locks position
					const pos = getUnitEdgePosition(unit, edge, this.nodesById);
					segments.push({
						unitId: unit.id,
						edgeId: edge.id,
						start: pos,
						end: pos,
						startTime: now,
						durationMs: 0,
					});
				}
			}

			// Broadcast game state to all connected clients
			const tickPayload = {
				units: this.units,
				segments,
				timestamp: now,
				nodes: Array.from(this.nodesById.values()),
				players: Object.fromEntries(this.playerStates),
			};
			if (conquestOccurred) {
				this.io.emit(EVENTS.S_GAME_TICK, tickPayload);
			}
			this.io.emit(EVENTS.S_GAME_TICK, tickPayload);

			// Emit combat events
			const aliveIds = new Set(this.units.map((u) => u.id));
			const alivePairs = pairs.filter((p) => aliveIds.has(p.aId) && aliveIds.has(p.bId));
			if (alivePairs.length > 0) {
				this.io.emit(EVENTS.COMBAT_EVENT, { pairs: alivePairs, timestamp: now });
			}

			// Emit death events
			for (const deadId of deadIds) {
				this.io.emit(EVENTS.S_UNIT_DEATH, { unitId: deadId });
			}
		}, TICK_RATE);
	}
}
