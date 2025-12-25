import { createServer } from 'http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@xeno/shared';
import { GameLoop } from './game/GameLoop';

const httpServer = createServer();

const io: Server<ClientToServerEvents, ServerToClientEvents> = new Server(httpServer, {
	cors: {
		origin: '*',
		methods: ['GET', 'POST']
	}
});

const gameLoop = new GameLoop(io);

gameLoop.start();

httpServer.listen(3000, () => {
	console.log('--- SERVER STARTED: RAIL SYSTEM ONLINE ---');
	console.log('Socket.IO listening on port 3000');
});
