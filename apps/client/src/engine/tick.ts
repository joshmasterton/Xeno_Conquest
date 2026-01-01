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
      // Preserve heading when idle
    } else {
      const elapsed = tNow - seg.startTime;
      const t = Math.min(1, Math.max(0, elapsed / seg.durationMs));
      const x = seg.start.x + (seg.end.x - seg.start.x) * t;
      const y = seg.start.y + (seg.end.y - seg.start.y) * t;
      sprite.position.set(x, y);

      const dx = seg.end.x - seg.start.x;
      const dy = seg.end.y - seg.start.y;
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        (sprite as UnitSprite).moveHeading = Math.atan2(dy, dx);
      }
    }
  }

  // LOD & ANIMATION LOOP (Runs for all units, even idle ones)
  for (const sprite of host.unitSprites.values()) {
    updateTacticalVisuals(host, sprite as UnitSprite, currentZoom, now);
  }

  // Layer Visibility based on Zoom
  const macro = currentZoom < 0.2;
  if (host.railsLayer) host.railsLayer.alpha = macro ? 0.15 : 0.3;
  if (host.provincesLayer) host.provincesLayer.setVisible(true);
}
