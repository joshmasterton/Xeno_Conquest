# Xeno-Conquest Architecture Blueprint

## Vision & Constraints
- **Genre**: Persistent browser MMORTS; matches last 24–48h; playable on desktop + mobile.
- **Experience**: Semantic zoom from macro territory view to micro firefights with animated troops.
- **Philosophy**: Slow, authoritative server simulation (event/tick-driven) + fast, interpolated client visuals.
- **Guardrails**: Strict TypeScript everywhere; shared types; modular boundaries; avoid server-side 60 FPS loops.

## High-Level Architecture
- **Monorepo (npm workspaces or Turborepo)**
  - `packages/shared`: Types, constants, config, map gen utilities.
  - `apps/client`: React UI + Pixi.js renderer (Vite). Uses Zustand for client state.
  - `apps/server`: Node/Express + Socket.IO API (auth, lobbies, authoritative commands).
  - `apps/worker`: BullMQ job processors (movement, build, combat resolution). Shares Redis + Postgres with server.
- **Data & State**
  - Redis: Hot state (units, territories, sessions) + BullMQ queues.
  - Postgres: Accounts, matches, cold snapshots, audit trails.
  - Snapshots: Periodic Redis → Postgres for crash recovery; rehydrate on boot.
- **Transport**: Socket.IO (rooms per match + per combat). REST only for auth/bootstrap.

## Client (React + Pixi.js)
- **Render Architecture**
  - React renders HUD/menus; Pixi handles map/canvas. Avoid React reconciliation for per-frame sprites.
  - `MapEngine` (class) owns Pixi Application, Viewport, quadtree, sprite pools; exposes imperative API to React.
  - `pixi-viewport` for pan/zoom/inertia/clamping; `@pixi/react` only at shell level if desired.
- **Semantic Zoom (LOD)**
  - LOD0 (scale < 0.2): Territories as colored polygons; unit clusters/badges only.
  - LOD1 (0.2–0.8): Textures/borders fade in; squad dots.
  - LOD2 (scale > 0.8): Individual `AnimatedSprite`s with idle/walk/shoot; instancing via `ParticleContainer`/`RenderGroup`.
- **Performance**
  - Quadtree culling per frame against viewport bounds (+ margin).
  - Sprite pooling; texture atlases; avoid per-frame object creation.
  - Interpolation: Client lerps unit positions between `startTime` → `arrivalTime`; decoupled from server tick.
- **State Flow**
  - Socket events → client store → imperative calls to `MapEngine` (`upsertUnit`, `setTerritoryOwner`, `playCombat`).
  - Optimistic UI: Show orders immediately; mark pending until server ack.
- **UX**
  - Push notifications hooks; latency-tolerant inputs; offline resume by recomputing positions from timestamps.

## Server (API) & Worker (Jobs)
- **Authoritative Model**: Clients send intent; server validates; worker applies time-based outcomes.
- **Tick/Event Strategy**: Prefer event-driven jobs; light tick (e.g., 5–10s) only for upkeep/combat rounds.
- **Queues (BullMQ)**
  - `movement`: delayed arrivals; payload `{ unitId, from, to, eta }`.
  - `construction`: building completion timers.
  - `combat`: round resolution if sustained fights.
  - Persistence + repeatable jobs for periodic effects.
- **Commands**
  - `CMD_MOVE_UNIT`: validate ownership/path; compute duration; enqueue arrival; broadcast `UNIT_MOVING { start, end, startTime, arrivalTime }`.
  - `CMD_ATTACK` / `CMD_CAPTURE`: initiate combat/siege; enqueue rounds; emit updates.
- **Combat Resolution**
  - Deterministic math; send `seed` for client battle playback.
  - Round updates every N seconds; emit `combat_update { attackerId, targetId, damage }`.
- **Persistence & Recovery**
  - Redis hot state mirrored to Postgres snapshots; on restart, rehydrate queues from stored timestamps.

## Map & Territories
- **Generation**: Voronoi/relaxed Poisson disk for organic territories; seeded for reproducibility.
- **Terrain Features**: Water/barriers, craters/mountains as chokepoints; ensure logical aggregation (water in lows).
- **Frontline Mechanics**: Siege/occupation timers (1–2h) to prevent instant flips; triggers push notifications.

## Bot Ecology (Utility AI)
- **Utility Score**: `(territoryValue) / (distance + enemyStrength)` per border action.
- **Profiles**: Aggressive/defensive via weight curves; run in worker thread to isolate from socket latency.
- **Influence Maps**: Cheap scoring grid to guide expansion/defense.

## Security & Fair Play
- Trust server only; validate all commands; rate-limit per socket; audit trails in Postgres.
- Replayable seeds for combat visuals; anti-speed-hack by server time authority.

## Testing & Telemetry
- Unit tests for shared math (interp, distance, siege timers).
- Integration: fake sockets driving move/combat flows.
- Load tests for socket fan-out; soak tests for long-duration jobs.
- Metrics: queue lag, socket room counts, client FPS, memory per sprite, reconnect rates.

## Roadmap (phased)
1) Skeleton: Monorepo + Vite + Pixi stage + viewport pan/zoom on mobile.
2) Data Layer: Shared `Territory`/`Unit` types; server handshake sends map JSON; client renders.
3) Slow Movement: BullMQ + movement jobs; client interpolation lines; optimistic orders.
4) Visual Polish: LOD swaps; idle/walk animations; instanced rendering; combat playback.
5) Gameplay: Combat math on server; sieges; victory condition (>50% territories); reset loop.

## Prompts & Context Hygiene
- Keep AI focused on one box: specify file + interface being used; reference shared types.
- Use `copilot-context.md` and paste summary when starting new AI sessions.
