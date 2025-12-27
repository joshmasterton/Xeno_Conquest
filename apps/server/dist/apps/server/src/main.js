"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const GameLoop_1 = require("./game/GameLoop");
const httpServer = (0, http_1.createServer)();
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
const gameLoop = new GameLoop_1.GameLoop(io);
gameLoop.start();
httpServer.listen(3000, () => {
    console.log('--- SERVER STARTED: RAIL SYSTEM ONLINE ---');
    console.log('Socket.IO listening on port 3000');
});
