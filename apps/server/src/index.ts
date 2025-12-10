import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { QUEUE_NAMES, SERVER_TICK_MS, DEFAULT_MOVE_SPEED, MoveCommand, MovementIntent, Territory, Point } from "@xeno/shared";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let movementQueue: any = null;
let redisAvailable = false;
let mapSnapshot: Territory[] | null = null;
let connectedPlayers = new Set<string>();

const PORT = Number(process.env.PORT) || 3001;

// Deterministic map generation (same seed = same map)
function generateTerritories(seed: number = 42): Territory[] {
  // Seeded random using simple LCG
  let rng = seed;
  const random = () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };

  const worldSize = 2000;
  const territories: Territory[] = [];
  const seeds: Point[] = [];
  
  // Perlin-like noise function matching client terrain
  const noise = (x: number, y: number, scale: number = 0.01) => {
    const xi = Math.floor(x * scale);
    const yi = Math.floor(y * scale);
    const xf = (x * scale) - xi;
    const yf = (y * scale) - yi;
    
    // Smoothstep interpolation
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    
    // Pseudo-random gradients
    const hash = (i: number, j: number) => {
      const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
      return h - Math.floor(h);
    };
    
    const n00 = hash(xi, yi);
    const n10 = hash(xi + 1, yi);
    const n01 = hash(xi, yi + 1);
    const n11 = hash(xi + 1, yi + 1);
    
    const nx0 = n00 * (1 - u) + n10 * u;
    const nx1 = n01 * (1 - u) + n11 * u;
    return nx0 * (1 - v) + nx1 * v;
  };
  
  // Generate elevation map using complex multi-octave noise with ridges
  const elevation = (x: number, y: number) => {
    // DOMAIN WARPING: Distort coordinate space for organic shapes
    const warpScale = 80;
    const warpX = noise(x, y, 0.001) * warpScale;
    const warpY = noise(x + 500, y + 500, 0.001) * warpScale;
    const wx = x + warpX;
    const wy = y + warpY;
    
    // Secondary warp for complexity
    const warp2Scale = 40;
    const warp2X = noise(wx, wy, 0.002) * warp2Scale;
    const warp2Y = noise(wx + 300, wy + 300, 0.002) * warp2Scale;
    const wwx = wx + warp2X;
    const wwy = wy + warp2Y;
    
    // LARGE SCALE: Continental shapes (use warped coordinates)
    let largeScale = 0;
    largeScale += noise(wwx, wwy, 0.0003) * 1.0;
    largeScale += noise(wwx + 1000, wwy + 1000, 0.0006) * 0.5;
    largeScale = (largeScale - 0.75) * 0.7; // Much more water
    
    // MEDIUM SCALE: Regional terrain variation (use warped coordinates)
    let mediumScale = 0;
    let medAmp = 1.0;
    for (let i = 0; i < 8; i++) {
      const freq = 0.002 * Math.pow(2, i * 0.45);
      const offsetX = (i % 2 === 0 ? i * 100 : -i * 100);
      const offsetY = (i % 2 === 0 ? -i * 150 : i * 150);
      mediumScale += noise(wwx + offsetX, wwy + offsetY, freq) * medAmp;
      medAmp *= 0.55;
    }
    // Add prominent ridges for distinct coastline features
    const ridge1 = 1 - Math.abs(noise(wwx, wwy, 0.0025) * 2 - 1);
    const ridge2 = 1 - Math.abs(noise(wwx + 700, wwy + 700, 0.004) * 2 - 1);
    const ridge3 = 1 - Math.abs(noise(wwx - 400, wwy - 400, 0.006) * 2 - 1);
    mediumScale += ridge1 * 0.5 + ridge2 * 0.35 + ridge3 * 0.25;
    mediumScale = (mediumScale - 0.9) * 0.5; // Normalize
    
    // COASTLINE DETAIL: High-frequency noise for island complexity like reference
    let coastlineDetail = 0;
    let coastFreq = 0.008;
    let coastAmp = 0.4;
    for (let i = 0; i < 5; i++) {
      coastlineDetail += noise(x + i * 123, y + i * 321, coastFreq) * coastAmp;
      coastFreq *= 2.2;
      coastAmp *= 0.55;
    }
    coastlineDetail = coastlineDetail * 0.35; // Scale impact
    
    // SMALL SCALE: Subtle fine detail (6 octaves for texture, not noise)
    let smallScale = 0;
    let smallAmp = 1.0;
    for (let i = 0; i < 6; i++) {
      const freq = 0.012 * Math.pow(2, i * 0.5);
      const offsetX = (i % 3 === 0 ? i * 50 : (i % 3 === 1 ? -i * 50 : 0));
      const offsetY = (i % 3 === 0 ? -i * 50 : (i % 3 === 1 ? i * 50 : i * 25));
      smallScale += noise(x + offsetX, y + offsetY, freq) * smallAmp;
      smallAmp *= 0.6;
    }
    smallScale = (smallScale - 0.6) * 0.15; // Subtle impact
    
    // Rivers and straits - extensive water channels
    const river1 = Math.abs(noise(x + 300, y + 300, 0.0013) * 2 - 1);
    const river2 = Math.abs(noise(x - 300, y + 800, 0.0016) * 2 - 1);
    const river3 = Math.abs(noise(x + 800, y - 300, 0.0011) * 2 - 1);
    const river4 = Math.abs(noise(x - 600, y - 600, 0.0014) * 2 - 1);
    const river5 = Math.abs(noise(x + 1000, y + 500, 0.0015) * 2 - 1);
    const river6 = Math.abs(noise(x + 500, y - 700, 0.0012) * 2 - 1);
    const river7 = Math.abs(noise(x - 850, y + 350, 0.0017) * 2 - 1);
    const river8 = Math.abs(noise(x + 650, y + 650, 0.0010) * 2 - 1);
    let rivers = -(river1 * 0.24 + river2 * 0.20 + river3 * 0.20 + river4 * 0.18 + river5 * 0.18 + river6 * 0.16 + river7 * 0.14 + river8 * 0.14);
    
    // TRIBUTARY DETAIL: Dense river network like reference
    let tributaries = 0;
    let tribFreq = 0.004;
    let tribAmp = 0.15;
    for (let i = 0; i < 6; i++) {
      tributaries += Math.abs(noise(x + i * 234, y + i * 567, tribFreq) * 2 - 1) * tribAmp;
      tribFreq *= 1.8;
      tribAmp *= 0.65;
    }
    rivers -= tributaries;
    
    // Blend: large dominates, medium adds features, coastline adds complexity
    let combined = largeScale + mediumScale + coastlineDetail + smallScale + rivers;
    
    // THERMAL EROSION: Simulate rock weathering and talus slopes
    if (combined > 0.1) { // Only on higher land
      const talusAngle = 0.6; // Maximum stable slope
      const sampleDist = 8;
      const heightN = noise(wwx, wwy - sampleDist, 0.003);
      const heightS = noise(wwx, wwy + sampleDist, 0.003);
      const heightE = noise(wwx + sampleDist, wwy, 0.003);
      const heightW = noise(wwx - sampleDist, wwy, 0.003);
      
      const slopeX = Math.abs(heightE - heightW);
      const slopeY = Math.abs(heightN - heightS);
      const maxSlope = Math.max(slopeX, slopeY);
      
      if (maxSlope > talusAngle) {
        const weathering = (maxSlope - talusAngle) * 0.08;
        combined -= weathering;
      }
    }
    
    // STRATIFICATION: Add layered rock effect
    const stratificationNoise = noise(wwx, wwy, 0.008);
    const layers = Math.floor(combined * 8) / 8; // Create discrete elevation bands
    const stratEffect = (layers - combined) * 0.15 * stratificationNoise;
    combined += stratEffect;
    
    // Very strong edge fade to push water much deeper inward
    const fadeDistance = 500;
    const distToEdge = Math.min(x, y, worldSize - x, worldSize - y);
    if (distToEdge < fadeDistance) {
      const fadeFactor = distToEdge / fadeDistance;
      const smoothFade = fadeFactor * fadeFactor * (3 - 2 * fadeFactor);
      // Much stronger fade - force water at edges
      combined = combined * smoothFade - (1 - smoothFade) * 1.2;
    }
    
    return Math.max(-1, Math.min(1, combined));
  };
  
  // Generate MASSIVE number of territories for complex, detailed map
  const targetSeeds = 1200;
  let tries = 0;
  const maxTries = 100000;
  while (seeds.length < targetSeeds && tries < maxTries) {
    tries++;
    // Keep territories away from edges to prevent cutoff
    const margin = 100;
    const x = margin + random() * (worldSize - margin * 2);
    const y = margin + random() * (worldSize - margin * 2);
    const e = elevation(x, y);
    if (e < -0.15) continue; // water rejected
    seeds.push({ x, y });
  }
  
  console.log(`[Territory Gen] Generated ${seeds.length} Voronoi seeds`);

  // Build true vector-based Voronoi polygons (not grid-based)
  // Sample points along Voronoi edges to detect water boundaries
  const buildVoronoiPolygon = (seedIdx: number): Point[] => {
    const center = seeds[seedIdx];
    const polygon: Point[] = [];
    
    // Create circle of sample points around this seed to find Voronoi boundaries
    const samples = 128; // High sample count for detailed, smooth borders
    const maxRadius = 100; // Base territory size
    
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      let low = 0;
      let high = maxRadius;
      
      // Binary search to find exact Voronoi edge in this direction
      for (let iter = 0; iter < 15; iter++) { // More iterations = more precision
        const mid = (low + high) / 2;
        const testX = center.x + Math.cos(angle) * mid;
        const testY = center.y + Math.sin(angle) * mid;
        
        // Check if this point is on water
        const e = elevation(testX, testY);
        if (e < -0.15) {
          high = mid;
          continue;
        }
        
        // Check if this point is still closest to our seed
        let closestIdx = seedIdx;
        let bestDist = Infinity;
        for (let j = 0; j < seeds.length; j++) {
          const dx = testX - seeds[j].x;
          const dy = testY - seeds[j].y;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) {
            bestDist = dist;
            closestIdx = j;
          }
        }
        
        if (closestIdx === seedIdx) {
          low = mid;
        } else {
          high = mid;
        }
      }
      
      const boundaryX = Math.max(0, Math.min(worldSize, center.x + Math.cos(angle) * low));
      const boundaryY = Math.max(0, Math.min(worldSize, center.y + Math.sin(angle) * low));
      polygon.push({ x: boundaryX, y: boundaryY });
    }
    
    return polygon;
  };
  
  const highlandNames = ['Frost Peaks', 'Titan Ridge', 'Crystal Summit', 'Iron Heights', 'Storm Pinnacle'];
  const plainNames = ['Crimson Steppe', 'Azure Fields', 'Echo Valley', 'Nova Flats', 'Jade Expanse', 'Gamma Wastes', 'Sigma Grove'];
  const lowlandNames = ['Alpha Basin', 'Hydra Depths', 'Delta Marsh', 'Kilo Lagoon', 'Rift Chasm'];
  const craterNames = ['Ion Crater', 'Magma Core', 'Prism Crater', 'Omega Abyss'];
  const allNames = [...highlandNames, ...plainNames, ...lowlandNames, ...craterNames];
  
  // Create territories using smooth vector-based Voronoi polygons
  seeds.forEach((centroid, i) => {
    const e = elevation(centroid.x, centroid.y);
    
    let terrainType: 'highland' | 'plain' | 'lowland' | 'crater';
    if (e > 0.25) terrainType = 'highland';
    else if (e > -0.15) terrainType = 'plain';
    else if (e > -0.5) terrainType = 'lowland';
    else terrainType = 'crater';
    
    const polygon = buildVoronoiPolygon(i);
    
    let ownerId: string | undefined;
    if (i === 0) ownerId = 'player-1';
    else if (i === 1) ownerId = 'player-2';
    
    territories.push({
      id: `t-${i + 1}`,
      name: allNames[i % allNames.length] || `Territory ${i + 1}`,
      centroid,
      polygon,
      ownerId,
      terrainType,
      elevation: e
    });
  });
  
  return territories;
}

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get("/health", (_req, res) => {
    res.json({ ok: true, tickMs: SERVER_TICK_MS });
  });
  return app;
}

function startServer() {
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });

  // Static map is bundled with client - server only tracks game state
  mapSnapshot = generateTerritories(42);
  console.log("[Server] Map generated with", mapSnapshot.length, "territories");

  // Optionally initialize Redis queue; won't block server startup if unavailable.
  async function initQueue() {
    try {
      const { Queue } = await import("bullmq");
      const connection = { url: REDIS_URL };
      movementQueue = new Queue(QUEUE_NAMES.movement, { connection });
      redisAvailable = true;
      console.log("Redis queue initialized");
      movementQueue.on("error", () => {
        console.warn("Redis queue error");
      });
    } catch (err) {
      console.warn("Redis unavailable; operating in offline mode", err);
    }
  }

  // Don't block server startup
  initQueue().catch(() => {});

  io.on("connection", (socket) => {
    // Assign player ID based on connection order
    let playerId: string;
    if (!connectedPlayers.has('player-1')) {
      playerId = 'player-1';
      connectedPlayers.add('player-1');
    } else {
      playerId = 'player-2';
      connectedPlayers.add('player-2');
    }
    
    console.log("client connected", socket.id, "assigned as", playerId);
    
    // Only send game state, not map geometry (client has static map)
    if (mapSnapshot) {
      // Send only dynamic state: territory ownership + unit positions
      const gameState = {
        territories: mapSnapshot.map(t => ({
          id: t.id,
          ownerId: t.ownerId,
          // Polygon data not sent - client has it already
        })),
        units: [] // Will be populated as units spawn
      };
      socket.emit("game_state", gameState);
      socket.emit("player_assigned", { playerId });
      console.log("[Server] Sent game state to", socket.id);
    }
    
    socket.emit("welcome", { message: "Xeno-Conquest server ready" });

    socket.on("unit_spawned", (data: { unitId: string; position: Point; ownerId: string }) => {
      console.log("[Server] Unit spawned:", data.unitId, "owner:", data.ownerId);
      // Broadcast to all other clients
      socket.broadcast.emit("unit_spawned", data);
    });

    socket.on("move_unit", async (payload: MoveCommand) => {
      try {
        const now = Date.now();
        const speed = payload.speed ?? DEFAULT_MOVE_SPEED;
        const dx = payload.to.x - payload.from.x;
        const dy = payload.to.y - payload.from.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const durationSeconds = distance / Math.max(speed, 0.0001);
        const arrivalAt = now + durationSeconds * 1000;

        const intent: MovementIntent = {
          unitId: payload.unitId,
          from: payload.from,
          to: payload.to,
          issuedAt: now,
          arrivalAt,
        };

        if (movementQueue) {
          await movementQueue.add("arrival", intent, { delay: arrivalAt - now });
          console.log("[Server] Movement job enqueued:", payload.unitId);
        } else {
          console.log("[Server] Redis unavailable; broadcasting without persistence:", intent);
        }
        // Broadcast to all clients in the default namespace
        io.emit("unit_moving", intent);
        console.log("[Server] Broadcasted unit_moving:", intent);
      } catch (err) {
        console.error("Failed to enqueue move", err);
        socket.emit("error", { message: "Failed to enqueue move" });
      }
    });

    socket.on("disconnect", (reason) => {
      console.log("client disconnected", socket.id, reason);
      // Remove from connected players when they disconnect
      if (playerId) {
        connectedPlayers.delete(playerId);
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`Server listening on :${PORT}`);
  });
}

startServer();
