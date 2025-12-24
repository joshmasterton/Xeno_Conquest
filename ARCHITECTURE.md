# Xeno-Conquest Architecture Blueprint

## Vision & Constraints
- **Genre**: Single-Day Persistent MMORTS (Matches duration: ~8-16 hours).
- **Pacing**: "Accelerated Real-Time." High stakes, day-long campaigns that end before sleep.
- **Philosophy**: Deterministic, Rail-Based Movement. Stability > visual flair.
- **Guardrails**:
  - Strict TypeScript.
  - No client-side simulation (dumb client).
  - Server is the single source of truth.
  - **The 250-Line Rule**: Files must stay small and modular.

## High-Level Architecture
- **Monorepo**: `packages/shared`, `apps/client`, `apps/server`.
- **Data & State**:
  - **In-Memory (Server)**: Active `GameLoop`, `Unit` positions, `Combat` states.
  - **Redis**: Persistence snapshots & BullMQ queues (for non-movement jobs).
  - **Postgres**: Long-term storage (accounts, match history).

## Core Systems (The "New" Logic)

### 1. The Rail System (Movement)
- **Concept**: The map is a graph of `RoadNodes` connected by `RoadEdges`.
- **Logic**:
  - Units do not have (x,y) velocity vectors.
  - They have a `pathQueue`: `[CurrentNode, NextNode, ...DestNode]`.
  - **Tick Loop**: Every tick, the server moves the unit `speed * deltaTime` along the `RoadEdge`.
  - **Arrival**: When `distanceTraveled >= edgeLength`, the unit "snaps" to the `NextNode` and pops the queue.

### 2. The Combat System (Proximity)
- **Detection**: The server `GameLoop` checks distances between all units every tick.
- **Trigger**: If `distance(UnitA, UnitB) < COMBAT_RADIUS`:
  - Both units switch state to `COMBAT`.
  - Movement stops immediately.
  - They are "locked" until one dies or retreats.
- **Resolution**: A simple timer (e.g., 1s) deals damage based on stats.

## Client (React + Pixi.js)
- **Role**: Visualizer. It receives `UnitState` updates and draws them.
- **Interpolation**:
  - Client receives `{ id, position: {x,y}, target: {x,y} }`.
  - It moves the sprite smoothly from `current` to `target`.
  - If the server says "Teleport," the client teleports. It does not argue.

## Server (Node.js + Socket.IO)
- **GameLoop**:
  - A strict `setInterval` (e.g., 100ms or 200ms).
  - **Phase 1 (Movement)**: Update positions of all `MOVING` units.
  - **Phase 2 (Collision)**: Check for `COMBAT` triggers.
  - **Phase 3 (Combat)**: Apply damage to locked units.
  - **Phase 4 (Broadcast)**: Send delta updates to clients.

## Roadmap (Rebuild Strategy)
1. **Clean Slate**: Delete existing `MovementSystem.ts` and `CombatSystem.ts`.
2. **Data Model**: Define strict `Unit`, `RoadNode`, `RoadEdge` interfaces in `shared`.
3. **The Rail**: Implement the Server `tick()` that moves a unit from Node A to Node B.
4. **Visuals**: Update Client to render units walking the line.
5. **Combat**: Add the proximity check to the tick loop.