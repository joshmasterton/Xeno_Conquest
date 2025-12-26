import { RoadEdge, Unit, worldGraph, TICK_RATE, EVENTS, BASE_NODE_IDS, type RoadNode, type MovementSegment, type MoveOrder } from '@xeno/shared';
import { updateUnitPosition } from './systems/MovementSystem';
import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@xeno/shared';
import { findPath, edgeForStep } from './systems/Pathing';
import { buildSegment, getUnitEdgePosition } from './systems/MovementView';
import { detectProximity } from './systems/CombatSystem';
import { createAIUnits, createAIUnitsFromBases, updateAIPaths } from './systems/AISystem';
import { processPlayerOrder } from './systems/PlayerOrderSystem';

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

		// Spawn multiple AI units at bases with BFS routes
		this.units = createAIUnitsFromBases(15, this.edges, worldGraph.nodes, BASE_NODE_IDS);

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

			// Reassign paths for AI units that arrived with no pending plan
			updateAIPaths(this.units, this.edges, worldGraph.nodes);

			// Build interpolation/idle segments for visualization
			const segments: MovementSegment[] = [];
			for (const unit of this.units) {
				const edge = this.edgesMap.get(unit.edgeId); // ✅ O(1)
				if (!edge) continue;

				const isMoving = !!(unit.pathQueue && unit.pathQueue.length > 0);
				if (isMoving) {
					const seg = buildSegment(now, unit, edge, this.nodesById);
					if (seg) segments.push(seg);
				} else {
					// Idle snapshot to keep client position stable
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
			this.io.emit(EVENTS.S_GAME_TICK, {
				units: this.units,
				segments,
				timestamp: now,
			});

			// Proximity detection → combat event
			const pairs = detectProximity(this.units, this.edges, this.nodesById);
			if (pairs.length > 0) {
				this.io.emit(EVENTS.COMBAT_EVENT, { pairs, timestamp: now });
			}
		}, TICK_RATE);
	}
}
