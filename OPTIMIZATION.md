# Xeno-Conquest Optimization Strategy

## Map Data Efficiency - Static Map Architecture

### The Supremacy 1914 Approach ✅
Games like Supremacy 1914, Hearts of Iron, Risk don't send map data over the network. Instead:

**Map is STATIC** (bundled with client at build time)
- Map geometry never changes between matches
- Client downloads map once with initial page load (~20KB gzipped)
- Map data is treated like an image asset

**Only GAME STATE is transmitted** (what changes during play)
- Territory ownership: `{ "t-42": "player-3" }` - 20 bytes
- Unit positions: `{ "unit-123": { x: 450, y: 320 } }` - 40 bytes
- Combat events, resource updates, etc.

### Implementation

#### 1. Generate Static Map (Build Time)
```bash
npm run generate:map
# Creates apps/client/src/assets/staticMap.json
# Bundled with Vite build → served as static asset
```

Client loads map from local bundle:
```typescript
import staticMap from './assets/staticMap.json';
mapEngine.loadStaticMap(staticMap.territories);
```

#### 2. Server Tracks Only Dynamic State
```typescript
// On connect - send ONLY ownership + units (tiny payload)
socket.emit("game_state", {
  territories: { "t-1": "player-1", "t-2": null, ... }, // ~2KB
  units: [{ id: "u-1", x: 450, y: 320, ownerId: "player-1" }] // ~1KB
});
```

#### 3. Delta Updates for State Changes
```typescript
// BAD - Full snapshot every time
socket.emit("territory_update", { territories: allTerritories });

// GOOD - Delta only
socket.emit("territory_owner_changed", { 
  territoryId: "t-42", 
  newOwnerId: "player-3" 
});
```

#### 4. Binary Protocol for Movement
```typescript
// BAD - JSON for frequent updates
{ unitId: "unit-123", x: 1234.56, y: 789.12 }  // ~40 bytes

// GOOD - Binary buffer
Float32Array([1234.56, 789.12])  // 8 bytes (80% reduction)
```

### Implementation Priority

**Phase 1 (Current):** ✅ Static map generation
**Phase 2 (Next):** Polygon simplification for LOD0
**Phase 3 (Future):** On-demand territory detail loading
**Phase 4 (Scale):** Binary protocol for unit positions

## Cost Analysis

### OLD Approach (sending map over network)
- Map data per client: 50KB
- Per day (10 connects/user, 100 CCU): 50KB × 100 × 10 = 50MB/day
- Movement updates: ~100 bytes × 10/sec × 86400sec = 86MB/day
- **Total: ~136MB/day**

### NEW Approach (static map + state only)
- Map data: 0 bytes (bundled with client, served as static asset)
- Initial game state: 3KB (ownership + units)
- Per day reconnects: 3KB × 100 × 10 = 3MB/day
- Movement updates: ~50 bytes × 10/sec × 86400sec = 43MB/day
- **Total: ~46MB/day (66% reduction)**
- **Map bandwidth: 0MB (100% reduction)**

## Server Cost Optimization

### Use Redis for Hot State
```
Units in movement  → Redis (fast reads/writes)
Territory owners   → Redis (frequent updates)
Player session     → Redis (ephemeral)
Match history      → Postgres (cold storage)
```

### WebSocket Connection Pooling
- Limit to 1 connection per player (disconnect old on new connect)
- Use Socket.IO rooms for territory-based message filtering
- Only broadcast events to players in visible range

### Compute Optimization
- Generate map ONCE per match start (deterministic seed)
- Cache Voronoi calculations in Redis
- Use quadtree for unit collision detection (O(log n) vs O(n²))

## Monitoring Metrics
```
- Average map transmission size
- WebSocket messages/second per connection
- Redis memory usage
- Server CPU per 100 CCU
```

Target: **< 100MB/day bandwidth per 100 CCU**
