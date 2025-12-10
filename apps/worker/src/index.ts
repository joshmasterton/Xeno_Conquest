import "dotenv/config";
import { Queue, Worker } from "bullmq";
import { DEFAULT_MOVE_SPEED, MovementIntent, QUEUE_NAMES } from "@xeno/shared";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = { url: REDIS_URL };

async function startWorker() {
  try {
    // Test connection early; if it fails, exit gracefully so dev can still run client/server.
    const movementQueue = new Queue<MovementIntent>(QUEUE_NAMES.movement, { connection });
    await movementQueue.waitUntilReady();

    const worker = new Worker<MovementIntent>(
      QUEUE_NAMES.movement,
      async (job) => {
        const intent = job.data;
        const now = Date.now();
        const elapsed = now - intent.issuedAt;
        const expected = intent.arrivalAt - intent.issuedAt;
        console.log(`[Worker] Unit ${intent.unitId} arrived at (${intent.to.x}, ${intent.to.y}) after ${elapsed}ms (expected ${expected}ms)`);
        // TODO: Update Redis/Postgres with final position; trigger combat if needed
      },
      { connection }
    );

    worker.on("completed", (job) => {
      console.log(`Movement job completed`, job.id);
    });

    worker.on("failed", (job, err) => {
      console.error(`Movement job failed`, job?.id, err);
    });

    worker.on("error", (err) => {
      console.error("Worker redis error, exiting worker (client/server can keep running):", err);
      process.exit(0);
    });

    console.log("Worker shell up", { moveSpeed: DEFAULT_MOVE_SPEED, redis: REDIS_URL });
  } catch (err) {
    console.warn("Redis unavailable; skipping worker. Client/server remain usable.", err);
    process.exit(0);
  }
}

startWorker();
