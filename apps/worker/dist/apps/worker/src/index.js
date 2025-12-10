"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const bullmq_1 = require("bullmq");
const shared_1 = require("@xeno/shared");
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = { url: REDIS_URL };
const movementQueue = new bullmq_1.Queue(shared_1.QUEUE_NAMES.movement, { connection });
function startWorker() {
    const worker = new bullmq_1.Worker(shared_1.QUEUE_NAMES.movement, async (job) => {
        const intent = job.data;
        // Placeholder: actual arrival/combat logic will live here.
        console.log("Process movement", intent);
    }, { connection });
    worker.on("completed", (job) => {
        console.log(`Movement job completed`, job.id);
    });
    worker.on("failed", (job, err) => {
        console.error(`Movement job failed`, job?.id, err);
    });
    console.log("Worker shell up", { moveSpeed: shared_1.DEFAULT_MOVE_SPEED, redis: REDIS_URL });
}
startWorker();
