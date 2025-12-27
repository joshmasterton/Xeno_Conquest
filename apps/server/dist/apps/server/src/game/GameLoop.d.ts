import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@xeno/shared';
export declare class GameLoop {
    private readonly units;
    private readonly edges;
    private readonly edgesMap;
    private readonly io;
    private readonly nodesById;
    private readonly playerStates;
    private lastTick;
    constructor(io: Server<ClientToServerEvents, ServerToClientEvents>);
    start(): void;
}
