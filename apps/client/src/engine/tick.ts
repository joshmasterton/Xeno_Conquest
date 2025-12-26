import { Graphics } from 'pixi.js';
import type { ServerGameTick } from '@xeno/shared';
import type { MapEngine } from './MapEngine';

export function handleTick(host: MapEngine) {
  (host as any).frames++;
  const now = performance.now();
  const lastSample = (host as any).lastSample;
  if (now - lastSample >= 1000) {
    const zoom = Number((host as any).viewport.scale.x.toFixed(2));
    (host as any).metricsCb?.({
      fps: (host as any).frames,
      zoom,
      unitCount: (host as any).unitSprites.size,
      selectedUnit: (host as any).selectedUnitId,
    });
    (host as any).frames = 0;
    (host as any).lastSample = now;
  }

  // Interpolate unit positions from active segments
  const tNow = Date.now();
  for (const [unitId, seg] of (host as any).activeSegments) {
    const sprite: Graphics | undefined = (host as any).unitSprites.get(unitId);
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
  const currentZoom = (host as any).viewport.scale.x;
  const macro = currentZoom < 0.2;
  for (const sprite of (host as any).unitSprites.values()) {
    (sprite as Graphics).visible = !macro;
  }
  if ((host as any).railsLayer) (host as any).railsLayer.alpha = macro ? 0.15 : 0.3;
  if ((host as any).provincesLayer) (host as any).provincesLayer.setVisible(true);
}
