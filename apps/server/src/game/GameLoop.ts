import { RoadEdge, Unit, worldGraph } from '@xeno/shared';
import { updateUnitPosition } from './systems/MovementSystem';
import { Server } from 'socket.io';

export class GameLoop {
	private readonly units: Unit[];
	private readonly edges: RoadEdge[];
	private readonly io: Server;
	private lastTick = Date.now();

	constructor(io: Server) {
		this.io = io;
		this.edges = worldGraph.edges as RoadEdge[];
		console.log(`Loaded ${this.edges.length} edges from world graph.`);

		this.units = [
			{ id: 'u1', edgeId: this.edges[0].id, distanceOnEdge: 0, speed: 50 },
		];
	}

	start(): void {
		this.lastTick = Date.now();

		setInterval(() => {
			const now = Date.now();
			const deltaTime = (now - this.lastTick) / 1000;
			this.lastTick = now;

			for (const unit of this.units) {
				const edge = this.edges.find((e) => e.id === unit.edgeId);
				if (!edge) continue;

				updateUnitPosition(unit, edge, this.edges, deltaTime);
				console.log(`Unit ${unit.id}: ${unit.distanceOnEdge.toFixed(1)} / ${edge.length}`);
			}

			// Broadcast game state to all connected clients
			this.io.emit('S_GAME_TICK', {
				units: this.units,
				timestamp: Date.now()
			});
		}, 100);
	}
}
