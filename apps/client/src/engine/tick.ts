import { Graphics } from 'pixi.js';
import type { ServerGameTick } from '@xeno/shared';
import type { MapEngine, IMapEngineState } from './MapEngine';
import { updateTacticalVisuals, type UnitSprite } from './view';

export function handleTick(host: IMapEngineState & MapEngine) {
  host.incrementFrames();
  const now = performance.now();
  const lastSample = host.getLastSample();
  
  // Update Metrics (FPS etc)
  if (now - lastSample >= 1000) {
    const zoom = Number(host.viewport.scale.x.toFixed(2));
    host.notifyMetrics({
      fps: host.getFrames(),
      zoom,
      unitCount: host.unitSprites.size,
      selectedUnit: host.selectedUnitId,
    });
    host.setLastSample(now);
  }

  const tNow = Date.now();
  const currentZoom = host.viewport.scale.x;

  // INTERPOLATION LOOP
  for (const [unitId, seg] of host.activeSegments) {
    const sprite = host.unitSprites.get(unitId);
    if (!sprite) continue;

    // 1. Calculate Position
    if (seg.durationMs === 0) {
      sprite.position.set(seg.start.x, seg.start.y);
    } else {
      const elapsed = tNow - seg.startTime;
      const t = Math.min(1, Math.max(0, elapsed / seg.durationMs));
      const x = seg.start.x + (seg.end.x - seg.start.x) * t;
      const y = seg.start.y + (seg.end.y - seg.start.y) * t;
      sprite.position.set(x, y);

      // 2. Calculate Rotation (Face Movement Direction)
      // Only rotate if actually moving
      if ((sprite as UnitSprite).tacticalLayer) {
        const dx = seg.end.x - seg.start.x;
        const dy = seg.end.y - seg.start.y;
        
        // If moving significantly
        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          const rotation = Math.atan2(dy, dx);
          (sprite as UnitSprite).tacticalLayer!.rotation = rotation;
          (sprite as UnitSprite).lastDirection = rotation;
        } else if (typeof (sprite as UnitSprite).lastDirection === 'number') {
           // Keep last direction if idle
           (sprite as UnitSprite).tacticalLayer!.rotation = (sprite as UnitSprite).lastDirection;
        }
      }
    }
  }

  // LOD & ANIMATION LOOP (Runs for all units, even idle ones)
  for (const sprite of host.unitSprites.values()) {
    updateTacticalVisuals(sprite as UnitSprite, currentZoom, now);
  }

  // Layer Visibility based on Zoom
  const macro = currentZoom < 0.2;
  if (host.railsLayer) host.railsLayer.alpha = macro ? 0.15 : 0.3;
  if (host.provincesLayer) host.provincesLayer.setVisible(true);
}
