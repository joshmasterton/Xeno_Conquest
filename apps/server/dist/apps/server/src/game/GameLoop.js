"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameLoop = void 0;
const shared_1 = require("@xeno/shared");
const MovementSystem_1 = require("./systems/MovementSystem");
const MovementView_1 = require("./systems/MovementView");
const CombatSystem_1 = require("./systems/CombatSystem");
const AISystem_1 = require("./systems/AISystem");
const PlayerOrderSystem_1 = require("./systems/PlayerOrderSystem");
const DamageSystem_1 = require("./systems/DamageSystem");
const ConquestSystem_1 = require("./systems/ConquestSystem");
const ResourceSystem_1 = require("./systems/ResourceSystem");
const StackingSystem_1 = require("./systems/StackingSystem");
function createBidirectionalEdges(edges) {
    const key = (a, b) => `${a}->${b}`;
    const seen = new Set(edges.map((e) => key(e.sourceNodeId, e.targetNodeId)));
    const result = [...edges];
    for (const e of edges) {
        const reverseKey = key(e.targetNodeId, e.sourceNodeId);
        if (!seen.has(reverseKey)) {
            seen.add(reverseKey);
            result.push({ ...e, id: `${e.id}__rev`, sourceNodeId: e.targetNodeId, targetNodeId: e.sourceNodeId });
        }
    }
    return result;
}
class GameLoop {
    constructor(io) {
        this.playerStates = new Map();
        this.lastTick = Date.now();
        this.io = io;
        this.edges = createBidirectionalEdges(shared_1.worldGraph.edges);
        this.edgesMap = new Map(this.edges.map((e) => [e.id, e])); // ✅ Build O(1) map
        this.nodesById = new Map(shared_1.worldGraph.nodes.map((n) => [n.id, n]));
        console.log(`Loaded ${this.edges.length} edges from world graph.`);
        // Initialize players with zeroed resources
        this.playerStates.set('player-1', { gold: 0, manpower: 0 });
        // Spawn one AI unit at each province (17 total)
        this.units = (0, AISystem_1.createAIUnitsFromBases)(shared_1.worldGraph.nodes.length, this.edges, shared_1.worldGraph.nodes, shared_1.worldGraph.nodes.map(n => n.id));
        // Spawn one test player unit at first base's outgoing edge
        const baseId = shared_1.BASE_NODE_IDS[0];
        const outgoing = this.edges.filter((e) => e.sourceNodeId === baseId);
        const playerEdge = outgoing[0] ?? this.edges.find((e) => e.targetNodeId === baseId) ?? this.edges[0];
        this.units.push({
            id: 'player-1',
            edgeId: playerEdge.id,
            distanceOnEdge: 0,
            speed: 60,
            ownerId: 'player-1',
            pathQueue: [],
            hp: 100,
            maxHp: 100,
            state: 'IDLE',
            count: 1,
        });
        console.log(`✅ Player spawned from base ${baseId} on edge ${playerEdge.id}, pathQueue=[]`);
        // Listen for player move orders
        console.log('🔌 Setting up Socket.IO event listeners...');
        this.io.on('connection', (socket) => {
            console.log(`✅ Client connected: ${socket.id}`);
            const playerId = 'player-1';
            if (!this.playerStates.has(playerId)) {
                this.playerStates.set(playerId, { gold: 0, manpower: 0 });
            }
            socket.on(shared_1.EVENTS.C_MOVE_ORDER, (order) => {
                console.log(`📍 Order received: unit ${order.unitId} → node ${order.destNodeId}`);
                (0, PlayerOrderSystem_1.processPlayerOrder)(order, this.units, this.edges, Array.from(this.nodesById.values()));
                const unit = this.units.find((u) => u.id === order.unitId);
                if (unit) {
                    console.log(`✓ Unit updated: edgeId=${unit.edgeId}, pathQueue=[${unit.pathQueue?.join(', ') || 'empty'}]`);
                }
            });
            socket.on(shared_1.EVENTS.C_BUILD_UNIT, (payload) => {
                const cost = 50;
                const player = this.playerStates.get(playerId);
                if (!player)
                    return;
                const node = this.nodesById.get(payload.nodeId);
                if (!node || node.ownerId !== playerId)
                    return;
                if (player.gold < cost)
                    return;
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
                    hp: 100,
                    maxHp: 100,
                    state: 'IDLE',
                    count: 1,
                });
                console.log(`⚒️ Unit built by ${playerId} at node ${payload.nodeId}`);
            });
            socket.on('disconnect', () => {
                console.log(`❌ Client disconnected: ${socket.id}`);
            });
        });
    }
    start() {
        this.lastTick = Date.now();
        const RESOURCE_TICK_MS = 1000;
        setInterval(() => {
            (0, ResourceSystem_1.processResources)(Array.from(this.nodesById.values()), this.playerStates);
        }, RESOURCE_TICK_MS);
        setInterval(() => {
            const now = Date.now();
            const deltaTime = (now - this.lastTick) / 1000;
            this.lastTick = now;
            // Update unit positions
            for (const unit of this.units) {
                const edge = this.edgesMap.get(unit.edgeId); // ✅ O(1)
                if (!edge)
                    continue;
                (0, MovementSystem_1.updateUnitPosition)(unit, edge, this.edges, deltaTime);
                if (unit.id === 'player-1') {
                    console.log(`🎮 player-1: distance=${unit.distanceOnEdge.toFixed(1)}/${edge.length}, pathQueue=[${unit.pathQueue?.join(', ') || 'empty'}]`);
                }
            }
            // Conquest
            const conquestOccurred = (0, ConquestSystem_1.processConquest)(this.units, Array.from(this.nodesById.values()));
            // Stacking: merge friendly overlapping units
            const absorbedIds = (0, StackingSystem_1.processStacking)(this.units, this.edges);
            // Reassign paths for AI units that arrived with no pending plan
            (0, AISystem_1.updateAIUnits)(this.units, this.edges, shared_1.worldGraph.nodes);
            // Combat
            const pairs = (0, CombatSystem_1.detectProximity)(this.units, this.edges, this.nodesById);
            (0, DamageSystem_1.processCombat)(this.units, pairs, deltaTime);
            // Mark dead units and remove immediately from array
            const deadIds = [...absorbedIds];
            for (let i = this.units.length - 1; i >= 0; i--) {
                const unit = this.units[i];
                if (typeof unit.hp === 'number' && unit.hp <= 0) {
                    if (!deadIds.includes(unit.id))
                        deadIds.push(unit.id);
                    this.units.splice(i, 1); // Remove now so they don't appear in tick broadcast
                }
            }
            // Build interpolation/idle segments for visualization
            const segments = [];
            for (const unit of this.units) {
                const edge = this.edgesMap.get(unit.edgeId); // ✅ O(1)
                if (!edge)
                    continue;
                // FIX: If in COMBAT, force zero-duration segment to prevent shivering
                const isMoving = !!(unit.pathQueue && unit.pathQueue.length > 0) && unit.state !== 'COMBAT';
                if (isMoving) {
                    const seg = (0, MovementView_1.buildSegment)(now, unit, edge, this.nodesById);
                    if (seg)
                        segments.push(seg);
                }
                else {
                    // Idle snapshot (Combat or Standing still) — zero duration locks position
                    const pos = (0, MovementView_1.getUnitEdgePosition)(unit, edge, this.nodesById);
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
                this.io.emit(shared_1.EVENTS.S_GAME_TICK, tickPayload);
            }
            this.io.emit(shared_1.EVENTS.S_GAME_TICK, tickPayload);
            // Emit combat events
            const aliveIds = new Set(this.units.map((u) => u.id));
            const alivePairs = pairs.filter((p) => aliveIds.has(p.aId) && aliveIds.has(p.bId));
            if (alivePairs.length > 0) {
                this.io.emit(shared_1.EVENTS.COMBAT_EVENT, { pairs: alivePairs, timestamp: now });
            }
            // Emit death events
            for (const deadId of deadIds) {
                this.io.emit(shared_1.EVENTS.S_UNIT_DEATH, { unitId: deadId });
            }
        }, shared_1.TICK_RATE);
    }
}
exports.GameLoop = GameLoop;
