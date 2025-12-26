import { RoadEdge, Unit, worldGraph, TICK_RATE, EVENTS, BASE_NODE_IDS, type RoadNode, type MovementSegment, type MoveOrder } from '@xeno/shared';
import { updateUnitPosition } from './systems/MovementSystem';
import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@xeno/shared';
import { findPath, edgeForStep } from './systems/Pathing';
import { buildSegment, getUnitEdgePosition } from './systems/MovementView';
import { detectProximity } from './systems/CombatSystem';
import { createAIUnits, createAIUnitsFromBases, updateAIPaths } from './systems/AISystem';
import { processPlayerOrder } from './systems/PlayerOrderSystem';
import { processCombat } from './systems/DamageSystem';
import { processConquest } from './systems/ConquestSystem';

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
	private lastTick = Date.now();

	constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
		this.io = io;
		this.edges = createBidirectionalEdges(worldGraph.edges);
		this.edgesMap = new Map(this.edges.map((e) => [e.id, e])); // ✅ Build O(1) map
		this.nodesById = new Map(worldGraph.nodes.map((n) => [n.id, n]));
		console.log(`Loaded ${this.edges.length} edges from world graph.`);

		// Spawn one AI unit at each province (17 total)
		this.units = createAIUnitsFromBases(worldGraph.nodes.length, this.edges, worldGraph.nodes, worldGraph.nodes.map(n => n.id));

		// Spawn one test player unit at first base's outgoing edge
		const baseId = BASE_NODE_IDS[0];
		const outgoing = this.edges.filter((e) => e.sourceNodeId === baseId);
		const playerEdge = outgoing[0] ?? this.edges.find((e) => e.targetNodeId === baseId) ?? this.edges[0];
		this.units.push({
			id: 'player-1',
			edgeId: playerEdge!.id,
			distanceOnEdge: 0,
			speed: 60,
			ownerId: 'player-1',
			pathQueue: [],
			hp: 100,
			maxHp: 100,
			state: 'IDLE',
		});
		console.log(`✅ Player spawned from base ${baseId} on edge ${playerEdge!.id}, pathQueue=[]`);

		// Listen for player move orders
		console.log('🔌 Setting up Socket.IO event listeners...');
		this.io.on('connection', (socket) => {
			console.log(`✅ Client connected: ${socket.id}`);
			socket.on(EVENTS.C_MOVE_ORDER, (order: MoveOrder) => {
				console.log(`📍 Order received: unit ${order.unitId} → node ${order.destNodeId}`);
				processPlayerOrder(order, this.units, this.edges, Array.from(this.nodesById.values()));
				const unit = this.units.find((u) => u.id === order.unitId);
				if (unit) {
					console.log(`✓ Unit updated: edgeId=${unit.edgeId}, pathQueue=[${unit.pathQueue?.join(', ') || 'empty'}]`);
				}
			});
			socket.on('disconnect', () => {
				console.log(`❌ Client disconnected: ${socket.id}`);
			});
		});
	}

	start(): void {
		this.lastTick = Date.now();

		setInterval(() => {
			const now = Date.now();
			const deltaTime = (now - this.lastTick) / 1000;
			this.lastTick = now;

			for (const unit of this.units) {
				const edge = this.edgesMap.get(unit.edgeId); // ✅ O(1)
				if (!edge) continue;

				updateUnitPosition(unit, edge, this.edges, deltaTime);
				if (unit.id === 'player-1') {
					console.log(`🎮 player-1: distance=${unit.distanceOnEdge.toFixed(1)}/${edge.length}, pathQueue=[${unit.pathQueue?.join(', ') || 'empty'}]`);
				}
			}

			const conquestOccurred = processConquest(this.units, Array.from(this.nodesById.values()));

			// Reassign paths for AI units that arrived with no pending plan
			updateAIPaths(this.units, this.edges, worldGraph.nodes);

			const pairs = detectProximity(this.units, this.edges, this.nodesById);
			processCombat(this.units, pairs, deltaTime);

			const deadIds: string[] = [];
			for (let i = this.units.length - 1; i >= 0; i--) {
				const unit = this.units[i];
				if (typeof unit.hp === 'number' && unit.hp <= 0) {
					deadIds.push(unit.id);
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
			};
			if (conquestOccurred) {
				this.io.emit(EVENTS.S_GAME_TICK, tickPayload);
			}
			this.io.emit(EVENTS.S_GAME_TICK, tickPayload);

			const aliveIds = new Set(this.units.map((u) => u.id));
			const alivePairs = pairs.filter((p) => aliveIds.has(p.aId) && aliveIds.has(p.bId));
			if (alivePairs.length > 0) {
				this.io.emit(EVENTS.COMBAT_EVENT, { pairs: alivePairs, timestamp: now });
			}

			for (const deadId of deadIds) {
				this.io.emit(EVENTS.S_UNIT_DEATH, { unitId: deadId });
			}
		}, TICK_RATE);
	}
}
