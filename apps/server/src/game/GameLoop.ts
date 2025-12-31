import { RoadEdge, Unit, worldGraph, TICK_RATE, EVENTS, BASE_NODE_IDS, type RoadNode, type MovementSegment, type MoveOrder, type PlayerResources, type UpgradeNodePayload } from '@xeno/shared';
import { updateUnitPosition } from './systems/MovementSystem';
import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@xeno/shared';
import { findPath, edgeForStep } from './systems/Pathing';
import { buildSegment, getUnitEdgePosition } from './systems/MovementView';
import { detectProximity } from './systems/CombatSystem';
import { createAIUnitsFromBases, updateAIUnits, processAIEconomy } from './systems/AISystem';
import { processPlayerOrder, processUpgradeOrder } from './systems/PlayerOrderSystem';
import { processCombat } from './systems/DamageSystem';
import { processConquest } from './systems/ConquestSystem';
import { processResources } from './systems/ResourceSystem';
import { processStacking } from './systems/StackingSystem';
import { processRecruitment } from './systems/RecruitmentSystem';
import { StateManager } from './state/StateManager';

const STARTING_TROOPS = 20;
const HP_PER_SOLDIER = 100;
const SAVE_INTERVAL_MS = 30000; // Save every 30 seconds
const UNIT_CAP = 50; // Maximum units per faction

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
	private stateManager: StateManager;

	constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
		this.io = io;
		this.stateManager = new StateManager();
		this.edges = createBidirectionalEdges(worldGraph.edges);
		this.edgesMap = new Map(this.edges.map((e) => [e.id, e]));
		this.nodesById = new Map(worldGraph.nodes.map((n) => [n.id, n]));
		this.units = []; // Init empty
		console.log(`Loaded ${this.edges.length} edges from world graph.`);

		// Initialize game asynchronously (load save or start new game)
		this.initializeGame();
	}

	private async initializeGame() {
		const loadedState = await this.stateManager.load();

		if (loadedState) {
			// --- RESTORE SAVE ---
			console.log('📂 Restoring saved game state...');
			
			// 1. Restore Units
			this.units.push(...loadedState.units);
			
			// 2. Restore Nodes (Ownership/Fortification)
			for (const savedNode of loadedState.nodes) {
				const memoryNode = this.nodesById.get(savedNode.id);
				if (memoryNode) {
					Object.assign(memoryNode, savedNode);
				}
			}

			// 3. Restore Players
			for (const [id, res] of loadedState.players) {
				this.playerStates.set(id, res);
			}
		} else {
			// --- NEW GAME SETUP ---
			console.log('✨ Starting new game...');
			
			// Initialize province yields if missing
			for (const node of this.nodesById.values()) {
				if (!node.resourceYield) {
					node.resourceYield = {
						gold: Math.floor(Math.random() * 5) + 1,
						manpower: Math.floor(Math.random() * 3) + 1,
					};
				}
			}
			console.log('💰 Economy initialized.');

			// Initialize players with starter resources
			this.playerStates.set('player-1', { gold: 100, manpower: 200 });

			const playerBaseId = BASE_NODE_IDS[0];
			const aiBaseIds = BASE_NODE_IDS.slice(1);

			// Assign player base ownership
			const playerBase = this.nodesById.get(playerBaseId);
			if (playerBase) {
				playerBase.ownerId = 'player-1';
				console.log(`✅ Assigned Base ${playerBaseId} to player-1`);
			}

			// Spawn player army
			const pOutgoing = this.edges.filter((e) => e.sourceNodeId === playerBaseId);
			const pStartEdge = pOutgoing[0] ?? this.edges.find((e) => e.targetNodeId === playerBaseId);
			
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
			}

			// Spawn AI armies
			const aiUnits = createAIUnitsFromBases(aiBaseIds.length, this.edges, worldGraph.nodes, aiBaseIds);
			this.units.push(...aiUnits);
		}

		// Setup Socket Listeners
		this.setupSocketListeners();
	}

	private setupSocketListeners() {
		console.log('🔌 Setting up Socket.IO event listeners...');
		this.io.on('connection', (socket) => {
			console.log(`✅ Client connected: ${socket.id}`);
			const playerId = 'player-1';
			if (!this.playerStates.has(playerId)) {
				this.playerStates.set(playerId, { gold: 0, manpower: 0 });
			}
			socket.on(EVENTS.C_MOVE_ORDER, (order: MoveOrder) => {
				console.log(`📍 Order received: unit ${order.unitId} → node ${order.destNodeId}`);
				processPlayerOrder(playerId, order, this.units, this.edges, Array.from(this.nodesById.values()));
				const unit = this.units.find((u) => u.id === order.unitId);
				if (unit) {
					console.log(`✓ Unit updated: edgeId=${unit.edgeId}, pathQueue=[${unit.pathQueue?.join(', ') || 'empty'}]`);
				}
			});
			socket.on(EVENTS.C_BUILD_UNIT, (payload) => {
					const GOLD_COST = 100;
					const MANPOWER_COST = 50;
					const player = this.playerStates.get(playerId);
					if (!player) return;

					// Check Unit Cap
					const playerUnitCount = this.units.filter(u => u.ownerId === playerId).length;
					if (playerUnitCount >= UNIT_CAP) {
						console.log(`🚫 Unit cap reached for ${playerId} (${playerUnitCount}/${UNIT_CAP})`);
						return;
					}

					const node = this.nodesById.get(payload.nodeId);
					if (!node || node.ownerId !== playerId) return;
					if (player.gold < GOLD_COST || player.manpower < MANPOWER_COST) return;

					player.gold -= GOLD_COST;
					player.manpower -= MANPOWER_COST;
					this.playerStates.set(playerId, player);

				const outgoing = this.edges.filter((e) => e.sourceNodeId === payload.nodeId);
				const fallbackIncoming = this.edges.filter((e) => e.targetNodeId === payload.nodeId);
				const startEdge = outgoing[0] ?? fallbackIncoming[0] ?? this.edges[0];

				const unitId = `built-${playerId}-${Date.now()}`;
				
				// CHANGED: Build 1 soldier instead of STARTING_TROOPS
				const BUILD_AMOUNT = 1;
				
				this.units.push({
					id: unitId,
					edgeId: startEdge.id,
					distanceOnEdge: 0,
					speed: 60,
					ownerId: playerId,
					pathQueue: [],
					hp: BUILD_AMOUNT * HP_PER_SOLDIER,
					maxHp: BUILD_AMOUNT * HP_PER_SOLDIER,
					state: 'IDLE',
					count: BUILD_AMOUNT,
				});
				console.log(`⚒️ Unit built by ${playerId} at node ${payload.nodeId} (Size: ${BUILD_AMOUNT})`);
			});
			socket.on(EVENTS.C_UPGRADE_NODE, (payload: UpgradeNodePayload) => {
				processUpgradeOrder(playerId, payload.nodeId, Array.from(this.nodesById.values()), this.playerStates);
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

		// Recruitment Timer (every 60 seconds)
		const RECRUITMENT_TICK_MS = 60000;
		setInterval(() => {
			processRecruitment(
				this.units,
				this.edges,
				Array.from(this.nodesById.values()),
				this.playerStates
			);
		}, RECRUITMENT_TICK_MS);

		// AI Economy Tick (every 5 seconds)
		setInterval(() => {
			processAIEconomy(
				Array.from(this.nodesById.values()),
				this.units,
				this.playerStates,
				this.edges
			);
		}, 5000);

		// Auto-Save Timer (every 30 seconds)
		setInterval(() => {
			this.stateManager.save(
				this.units,
				Array.from(this.nodesById.values()),
				this.playerStates
			);
		}, SAVE_INTERVAL_MS);

		setInterval(() => {
			const now = Date.now();
			const deltaTime = (now - this.lastTick) / 1000;
			this.lastTick = now;

			// Update unit positions
			for (const unit of this.units) {
				const edge = this.edgesMap.get(unit.edgeId); // ✅ O(1)
				if (!edge) continue;

				// FIXED: Pass edgesMap instead of edges array for O(1) lookups
				updateUnitPosition(unit, edge, this.edgesMap, deltaTime);
			}

			// Conquest
			const conquestOccurred = processConquest(this.units, Array.from(this.nodesById.values()));

			// Stacking: merge friendly overlapping units
			const absorbedIds = processStacking(this.units, this.edges);

			// Reassign paths for AI units that arrived with no pending plan
			updateAIUnits(this.units, this.edges, worldGraph.nodes);

			// Combat
			const pairs = detectProximity(this.units, this.edges, this.nodesById);
			processCombat(this.units, pairs, deltaTime, this.edges, Array.from(this.nodesById.values()));

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
