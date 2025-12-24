# Xeno-Conquest Project Context & Constitution

## 1. Project Identity (The "North Star")
- **Genre:** Persistent MMORTS (**Single-Day Campaigns**: ~8-16 hours).
- **Core Philosophy:** "Day-Long Strategy."
    -   Matches start in the morning and conclude by the evening.
    -   Designed for a complete sense of accomplishment in one day (unlike Supremacy 1914's multi-week slog).
    -   **Pacing:** "Accelerated Real-Time." Units take minutes/hours to travel, not days.
- **Visuals:** Seamless **Semantic Zoom** (Map View -> Tactical View).
- **Architecture:** **Dumb Client / Authoritative Server**.

---

## 2. The "Constitution" (NON-NEGOTIABLE RULES)
*Any code violating these rules is automatically rejected.*

### A. The "Rail-Bound" Physics Law
1.  **NO Free Movement:** Units **never** possess an $(x, y)$ velocity vector.
2.  **Graph Attachment:** A Unit's position is strictly defined as `{ edgeId: string, distanceOnEdge: number }`.
3.  **Movement Logic:**
    -   *Server Tick:* `unit.distanceOnEdge += unit.speed * deltaTime`.
    -   *Node Arrival:* When `distance >= edge.length`, the unit snaps to the `targetNode`.
4.  **Prohibited:** Steering behaviors, flocking, boids, or client-side collision prediction.

### B. The "250-Line" Limit
1.  **Hard Limit:** No single file shall exceed **250 lines**.
2.  **Enforcement:** If a file approaches this limit, you **MUST** refactor it immediately into sub-modules (e.g., split `MovementSystem.ts` into `MovementCalculator.ts` and `PathFollower.ts`).
3.  **No God Classes:** `GameLoop.ts` and `MapEngine.ts` are *orchestrators only*. They import systems and call `update()`. They do not contain math.

### C. The "Single Source of Truth"
1.  **State Authority:** The Server (Node.js/Redis) owns the state.
2.  **Client Role:** The Client (React/Pixi) is a visualizer. It receives `{ startPos, endPos, startTime, duration }` and interpolates the visual position. It **never** calculates game logic.
3.  **Shared Data:** All core data structures (`Unit`, `Territory`, `RoadNode`) **MUST** be defined in `packages/shared/src/types.ts` first.

---

## 3. Technical Architecture

### Directory Structure (Monorepo)
-   `packages/shared`: **The Common Language.**
    -   `types/`: Interfaces for `Unit`, `RoadNode`, `GameState`.
    -   `config/`: Game constants (`COMBAT_RADIUS`, `TICK_RATE`).
-   `apps/server`: **The Brain (Node.js + Socket.IO).**
    -   `systems/`: Pure logic functions (e.g., `MovementSystem.ts`).
    -   `state/`: Redis/Memory state wrappers.
    -   `worker/`: BullMQ job processors for long-duration tasks (Construction).
-   `apps/client`: **The Eyes (React + Pixi.js).**
    -   `engine/`: PixiJS rendering logic (Quadtrees, LOD).
    -   `ui/`: React overlay components (Menus, HUD).

### The Technology Stack
-   **Frontend:** React (UI), Pixi.js (Map Renderer), Zustand (Client State), Vite.
-   **Backend:** Node.js, Socket.IO (Real-time events), BullMQ (Job Queue), Redis (Hot State).
-   **Language:** Strict TypeScript. `any` is forbidden.

---

## 4. Core Systems Specifications

### A. The Map & Rail System
-   **Data Model:** The map is a graph of `RoadNodes` (lat/long points) connected by `RoadEdges`.
-   **Pathfinding:** Server calculates path: `[NodeA, NodeB, NodeC]`. Unit stores this as a `pathQueue`.
-   **Visualization:** Client draws the unit on the line between A and B based on `(Date.now() - startTime) / duration`.

### B. Semantic Zoom (Level of Detail - LOD)
The renderer **must** swap assets based on `viewport.scale`:
1.  **Macro View (Zoom < 0.2):** Render abstract colored polygons (Territories) and Unit Count Badges.
2.  **Region View (Zoom 0.2 - 0.8):** Render high-res terrain and Unit "Dot" clusters.
3.  **Tactical View (Zoom > 0.8):** Render individual `AnimatedSprites` (Soldiers/Tanks) and projectiles.
    -   *Optimization:* Use **Quadtrees** to cull off-screen entities.

### C. Combat (The "Battle Movie")
1.  **Trigger:** Server checks `distance(UnitA, UnitB) < COMBAT_RADIUS`.
2.  **Resolution:** Server calculates damage mathematically in ticks.
3.  **Visualization:** Server sends `COMBAT_EVENT` to Client. Client plays a deterministic animation (e.g., "Tank A fires at Tank B"). No physics bullets.

---

## 5. Implementation Roadmap (Current Focus)

**Phase 1: The Rail System (Current Task)**
-   [ ] Define `RoadNode` and `RoadEdge` in `shared/types`.
-   [ ] Implement `MovementSystem.ts` (Server) using pure math (no vectors).
-   [ ] Implement `MapEngine.ts` (Client) to draw debug lines for the rail network.

---

## 6. AI Interaction Guide
*When asking the AI for help, copy-paste these specific instructions if it gets confused:*

> "Stop. Refer to the 'Rail-Bound Physics Law' in `copilot-context.md`. You are attempting to use vector math. Switch to edge-traversal logic: `distance += speed * delta`."

> "Stop. You are writing logic inside a Component or Manager. Move this logic to a pure function in `packages/shared` or `apps/server/systems`."

## 7. Directory Structure & Module Resolution (STRICT)

### A. The Monorepo Map
xeno-conquest/
├── packages/
│   └── shared/
│       ├── package.json  <-- Defines name: "@xeno/shared"
│       └── src/
│           ├── types/    <-- (RoadNode, RoadEdge, Unit)
│           └── index.ts  <-- Re-exports everything
├── apps/
│   ├── server/
│   │   └── src/
│   │       ├── game/
│   │       │   └── systems/ <-- Logic
│   │       └── GameLoop.ts
│   └── client/
│       └── src/
│           └── engine/   <-- Pixi Logic

### B. Import Rules (CRITICAL)
1.  **The Alias**: The project uses the `@xeno` scope defined in `tsconfig.base.json`.
2.  **The Rule**: NEVER import using relative paths like `../../packages/shared`.
    -   **Incorrect**: `import { Unit } from '../../../packages/shared/src/types/map';`
    -   **Correct**: `import { Unit } from '@xeno/shared';`
3.  **Troubleshooting**: If you see an import error, ensure `packages/shared/src/index.ts` is exporting the type you are trying to use.