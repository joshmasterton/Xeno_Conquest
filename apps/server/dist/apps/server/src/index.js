"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const shared_1 = require("@xeno/shared");
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
let movementQueue = null;
let redisAvailable = false;
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
    // Optionally initialize Redis queue; won't block server startup if unavailable.
    async function initQueue() {
        try {
            const { Queue } = await Promise.resolve().then(() => __importStar(require("bullmq")));
            const connection = { url: REDIS_URL };
            movementQueue = new Queue(shared_1.QUEUE_NAMES.movement, { connection });
            redisAvailable = true;
            console.log("Redis queue initialized");
            movementQueue.on("error", () => {
                console.warn("Redis queue error");
            });
        }
        catch (err) {
            console.warn("Redis unavailable; operating in offline mode", err);
        }
    }
    // Don't block server startup
    initQueue().catch(() => { });
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
                if (movementQueue) {
                    await movementQueue.add("arrival", intent, { delay: arrivalAt - now });
                }
                else {
                    console.log("Redis unavailable; movement broadcasted (no persistence):", intent);
                }
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
        console.log(`Server listening on :${PORT}`);
    });
}
startServer();
