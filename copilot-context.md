# Xeno-Conquest Project Context

## Core Identity
- Persistent browser MMORTS; 24–48h matches; sci-fi alien world.
- Semantic zoom: Territories → squad icons → individual animated sprites and firefights.
- Slow, authoritative server; fast, interpolated client visuals.

## Tech Stack Rules
- TypeScript everywhere; shared types in `packages/shared`.
- Client: React (HUD) + Pixi.js (`pixi-viewport`) + Vite; Zustand for client state.
- Server: Node/Express + Socket.IO; Redis for hot state; Postgres for cold state.
- Worker: BullMQ (Redis) for any action > 5s (movement, construction, sieges, combat rounds).

## Architecture Patterns
1) Manager pattern: React never mutates Pixi sprites directly. Use a `GameMapManager/MapEngine` class with imperative methods (`upsertUnit`, `setTerritoryOwner`, `playCombat`).
2) Shared truth: Define `Unit`, `Territory`, constants in `packages/shared` before use in client/server.
3) Time authority: Use BullMQ delayed jobs; do **not** rely on `setTimeout` for gameplay timers.
4) Optimistic UI: Show orders immediately; mark pending until server ack; reconcile on updates.
5) LOD/Zoom: LOD0 icons, LOD1 dots, LOD2 animated sprites; quadtree culling and sprite pooling.

## Coding Style
- Functional React components; hooks for UI state only.
- `async/await`; prefer `interface` over `type` for objects.
- Keep Pixi side class-based; avoid per-frame object creation; pool sprites.
- Brief comments for complex math (coord transforms, LOD thresholds).

## Prompting Strategy
- When starting a new chat, paste: "I am working on Xeno-Conquest. Use copilot-context.md."
- Always name the file and interface: "Using `Unit` from `@xeno/shared/types`, add `moveUnit` in `server/gameEngine.ts`."
- Keep scope narrow (one file/feature); avoid broad asks like "make units fight".

## Current Focus (initial bootstrapping)
- Set up monorepo with `packages/shared`, `apps/client`, `apps/server`, `apps/worker`.
- Implement Pixi stage + viewport pan/zoom; render generated territories.
- Add movement command flow: validate, enqueue BullMQ job, broadcast `UNIT_MOVING`, client interpolates.
