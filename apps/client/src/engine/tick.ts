import { Graphics } from 'pixi.js';
import type { ServerGameTick } from '@xeno/shared';
import type { MapEngine, IMapEngineState } from './MapEngine';

export function handleTick(host: IMapEngineState & MapEngine) {
  host.incrementFrames();
  const now = performance.now();
  const lastSample = host.getLastSample();
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

  // Interpolate unit positions from active segments
  const tNow = Date.now();
  for (const [unitId, seg] of host.activeSegments) {
    const sprite: Graphics | undefined = host.unitSprites.get(unitId);
    if (!sprite) continue;
    if (seg.durationMs === 0) {
      sprite.position.set(seg.start.x, seg.start.y);
      continue;
    }
    const elapsed = tNow - seg.startTime;
    const t = Math.min(1, Math.max(0, elapsed / seg.durationMs));
    const x = seg.start.x + (seg.end.x - seg.start.x) * t;
    const y = seg.start.y + (seg.end.y - seg.start.y) * t;
    sprite.position.set(x, y);
  }

  // LOD
  const currentZoom = host.viewport.scale.x;
  const macro = currentZoom < 0.2;
  for (const sprite of host.unitSprites.values()) {
    (sprite as Graphics).visible = !macro;
  }
  if (host.railsLayer) host.railsLayer.alpha = macro ? 0.15 : 0.3;
  if (host.provincesLayer) host.provincesLayer.setVisible(true);
}
