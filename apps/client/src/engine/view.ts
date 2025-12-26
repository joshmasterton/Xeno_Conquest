import { Graphics } from 'pixi.js';
import type { ServerGameTick } from '@xeno/shared';
import type { MapEngine } from './MapEngine';

export function handleGameTick(host: MapEngine, data: ServerGameTick) {
  // Ensure sprites exist for all units
  for (const serverUnit of data.units) {
    if (!(host as any).unitSprites.has(serverUnit.id)) {
      const g = new Graphics();
      const isPlayerUnit = serverUnit.ownerId && serverUnit.ownerId.startsWith('player');
      const color = isPlayerUnit ? 0xffaa00 : 0xff0000;
      g.beginFill(color);
      g.drawCircle(0, 0, 8);
      g.endFill();
      g.interactive = true;
      g.cursor = 'pointer';
      g.on('pointerdown', () => {
        (host as any).selectUnit(serverUnit.id);
      });
      (host as any).viewport.addChild(g);
      (host as any).unitSprites.set(serverUnit.id, g);
    }
  }
  // Update segments (replace per tick)
  (host as any).activeSegments.clear();
  for (const seg of data.segments) {
    (host as any).activeSegments.set(seg.unitId, seg);
    const sprite = (host as any).unitSprites.get(seg.unitId);
    if (sprite && seg.durationMs === 0) {
      (sprite as Graphics).position.set(seg.start.x, seg.start.y);
    }
  }
}

export function flashUnit(host: MapEngine, unitId: string) {
  const sprite = (host as any).unitSprites.get(unitId);
  if (!sprite) return;
  const existing = (host as any).flashTimers.get(unitId);
  if (existing) clearTimeout(existing);

  const priorHalo = (host as any).flashHalos.get(unitId);
  if (priorHalo && priorHalo.parent) priorHalo.parent.removeChild(priorHalo);

  const halo = new Graphics();
  halo.beginFill(0xffff00, 0.45);
  halo.drawCircle(0, 0, 12);
  halo.endFill();
  halo.alpha = 0.9;
  halo.scale.set(1.2);
  (sprite as Graphics).addChild(halo);
  (host as any).flashHalos.set(unitId, halo);

  const timer = window.setTimeout(() => {
    if (halo.parent) (halo.parent as any).removeChild(halo);
    (host as any).flashHalos.delete(unitId);
    (host as any).flashTimers.delete(unitId);
  }, 200);
  (host as any).flashTimers.set(unitId, timer);
}
