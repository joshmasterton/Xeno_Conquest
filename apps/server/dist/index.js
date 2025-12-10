"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const bullmq_1 = require("bullmq");
const shared_1 = require("@xeno/shared");
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = { url: REDIS_URL };
const movementQueue = new bullmq_1.Queue(shared_1.QUEUE_NAMES.movement, { connection });
const PORT = Number(process.env.PORT) || 3001;
function createApp() {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json());
    app.get("/health", (_req, res) => {
        res.json({ ok: true, tickMs: shared_1.SERVER_TICK_MS });
    });
    return app;
}
function startServer() {
    const app = createApp();
    const server = http_1.default.createServer(app);
    const io = new socket_io_1.Server(server, { cors: { origin: "*" } });
    io.on("connection", (socket) => {
        console.log("client connected", socket.id);
        socket.emit("welcome", { message: "Xeno-Conquest server ready" });
        socket.on("move_unit", async (payload) => {
            try {
                const now = Date.now();
                const speed = payload.speed ?? shared_1.DEFAULT_MOVE_SPEED;
                const dx = payload.to.x - payload.from.x;
                const dy = payload.to.y - payload.from.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const durationSeconds = distance / Math.max(speed, 0.0001);
                const arrivalAt = now + durationSeconds * 1000;
                const intent = {
                    unitId: payload.unitId,
                    from: payload.from,
                    to: payload.to,
                    issuedAt: now,
                    arrivalAt,
                };
                await movementQueue.add("arrival", intent, { delay: arrivalAt - now });
                socket.emit("unit_moving", intent);
            }
            catch (err) {
                console.error("Failed to enqueue move", err);
                socket.emit("error", { message: "Failed to enqueue move" });
            }
        });
        socket.on("disconnect", (reason) => {
            console.log("client disconnected", socket.id, reason);
        });
    });
    server.listen(PORT, () => {
        console.log(`Server listening on :${PORT}`, { redis: REDIS_URL });
    });
}
startServer();
