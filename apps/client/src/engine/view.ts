import { Graphics, Text, TextStyle } from 'pixi.js';
import type { ServerGameTick } from '@xeno/shared';
import { getFactionColor } from '@xeno/shared';
import type { MapEngine, IMapEngineState } from './MapEngine';

type UnitSprite = Graphics & {
  hpBarBg?: Graphics;
  hpBarFg?: Graphics;
  combatIcon?: Graphics;
  countLabel?: Text;
  unitOwnerId?: string;
  serverUnit?: { count?: number };
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function ensureUnitSprite(host: IMapEngineState & MapEngine, serverUnit: { id: string; ownerId: string | undefined }): UnitSprite {
  const existing = host.unitSprites.get(serverUnit.id) as UnitSprite | undefined;
  if (existing) return existing;

  const g = new Graphics() as UnitSprite;
  g.unitOwnerId = serverUnit.ownerId; // Store owner ID on sprite
  const color = getFactionColor(serverUnit.ownerId);
  g.beginFill(color);
  g.drawCircle(0, 0, 8);
  g.endFill();
  g.interactive = true;
  g.cursor = 'pointer';
  g.on('pointerdown', () => {
    host.selectUnit(serverUnit.id);
  });

  // Health bar background
  const barBg = new Graphics();
  barBg.beginFill(0x222222, 0.9);
  barBg.drawRect(0, 0, 16, 3);
  barBg.endFill();
  barBg.position.set(-8, -14);
  g.addChild(barBg);
  g.hpBarBg = barBg;

  // Health bar foreground
  const barFg = new Graphics();
  barFg.beginFill(0x00cc44, 0.95);
  barFg.drawRect(0, 0, 16, 3);
  barFg.endFill();
  barFg.position.set(-8, -14);
  barFg.pivot.set(0, 0);
  g.addChild(barFg);
  g.hpBarFg = barFg;

  // Combat icon (sword-ish mark)
  const combatIcon = new Graphics();
  combatIcon.lineStyle(2, 0xff4444, 0.9);
  combatIcon.moveTo(-2, -10);
  combatIcon.lineTo(0, -6);
  combatIcon.lineTo(2, -10);
  combatIcon.lineTo(0, -4);
  combatIcon.lineTo(0, -2);
  combatIcon.visible = false;
  g.addChild(combatIcon);
  g.combatIcon = combatIcon;

  // Unit Count Label
  const countStyle = new TextStyle({
    fontFamily: 'Arial',
    fontSize: 12,
    fill: '#ffffff',
    fontWeight: 'bold',
    stroke: '#000000',
    strokeThickness: 2,
  });
  const countLabel = new Text('', countStyle);
  countLabel.anchor.set(0.5);
  countLabel.position.set(0, -22);
  g.addChild(countLabel);
  g.countLabel = countLabel;

  host.viewport.addChild(g);
  host.unitSprites.set(serverUnit.id, g);

  return g;
}

function updateUnitSprite(sprite: UnitSprite, serverUnit: { hp?: number; maxHp?: number; state?: string; count?: number }): void {
  sprite.serverUnit = serverUnit;
  const maxHp = serverUnit.maxHp ?? 100;
  const hp = serverUnit.hp ?? maxHp;
  const ratio = maxHp > 0 ? clamp01(hp / maxHp) : 0;

  if (sprite.hpBarFg) {
    sprite.hpBarFg.scale.x = ratio;
    // Shift the bar color toward red as HP falls
    const low = ratio < 0.3;
    sprite.hpBarFg.tint = low ? 0xff4444 : 0x00cc44;
  }

  if (sprite.combatIcon) {
    sprite.combatIcon.visible = serverUnit.state === 'COMBAT';
  }

  if (sprite.countLabel) {
    const count = serverUnit.count ?? 1;
    sprite.countLabel.text = count > 1 ? `×${count}` : '';
    sprite.countLabel.visible = count > 1;
  }
}

export function handleGameTick(host: IMapEngineState & MapEngine, data: ServerGameTick) {
  // Ensure sprites exist for all units
  for (const serverUnit of data.units) {
    const sprite = ensureUnitSprite(host, serverUnit);
    updateUnitSprite(sprite, serverUnit);
  }
  // Update segments (replace per tick)
  host.activeSegments.clear();
  for (const seg of data.segments) {
    host.activeSegments.set(seg.unitId, seg);
    const sprite = host.unitSprites.get(seg.unitId);
    if (sprite && seg.durationMs === 0) {
      (sprite as Graphics).position.set(seg.start.x, seg.start.y);
    }
  }
}

export function flashUnit(host: IMapEngineState & MapEngine, unitId: string) {
  const sprite = host.unitSprites.get(unitId);
  if (!sprite) return;
  const existing = host.flashTimers.get(unitId);
  if (existing) clearTimeout(existing);

  const priorHalo = host.flashHalos.get(unitId);
  if (priorHalo && priorHalo.parent) priorHalo.parent.removeChild(priorHalo);

  const halo = new Graphics();
  halo.beginFill(0xffff00, 0.45);
  halo.drawCircle(0, 0, 12);
  halo.endFill();
  halo.alpha = 0.9;
  halo.scale.set(1.2);
  (sprite as Graphics).addChild(halo);
  host.flashHalos.set(unitId, halo);

  const timer = window.setTimeout(() => {
    if (halo.parent) (halo.parent as any).removeChild(halo);
    host.flashHalos.delete(unitId);
    host.flashTimers.delete(unitId);
  }, 200);
  host.flashTimers.set(unitId, timer);
}
