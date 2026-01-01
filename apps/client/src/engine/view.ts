import { Container, Graphics } from 'pixi.js';
import type { ServerGameTick } from '@xeno/shared';
import { getFactionColor } from '@xeno/shared';
import type { MapEngine } from './MapEngine';

export type UnitSprite = Container & {
  hpBarBg?: Graphics;
  hpBarFg?: Graphics;
  strategicLayer?: Graphics;
  tacticalLayer?: Container;
  unitOwnerId?: string;
  serverUnit?: { id: string; count?: number; state?: string; hp?: number; maxHp?: number };
  renderedCount?: number;
  moveHeading?: number;
  combatEngagements: Map<string, number>;
};

function darken(color: number, percent: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return (
    (Math.floor(r * (1 - percent)) << 16) |
    (Math.floor(g * (1 - percent)) << 8) |
    Math.floor(b * (1 - percent))
  );
}

function lerpAngle(start: number, end: number, amount: number): number {
  let diff = end - start;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return start + diff * amount;
}

function seededRandom(seed: number): number {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function createSoldier(index: number, color: number, unitSeed: number): Container {
  const vestColor = darken(color, 0.4);
  const g = new Container();

  const s1 = seededRandom(unitSeed + index * 100 + 1);
  const s2 = seededRandom(unitSeed + index * 100 + 2);
  const s3 = seededRandom(unitSeed + index * 100 + 3);

  const footL = new Graphics();
  footL.beginFill(0x111111);
  footL.drawCircle(0, 0, 0.35);
  footL.endFill();
  footL.position.set(-0.4, 0);
  (g as any).footL = footL;
  g.addChild(footL);

  const footR = new Graphics();
  footR.beginFill(0x111111);
  footR.drawCircle(0, 0, 0.35);
  footR.endFill();
  footR.position.set(0.4, 0);
  (g as any).footR = footR;
  g.addChild(footR);

  const bodyGroup = new Container();
  g.addChild(bodyGroup);
  (g as any).bodyGroup = bodyGroup;

  const vest = new Graphics();
  vest.beginFill(vestColor);
  vest.drawRoundedRect(-0.8, -0.6, 1.6, 1.2, 0.3);
  vest.endFill();
  bodyGroup.addChild(vest);

  const head = new Graphics();
  head.beginFill(color);
  head.drawCircle(0, 0, 0.6);
  head.endFill();
  bodyGroup.addChild(head);

  const gun = new Graphics();
  gun.lineStyle(0.4, 0x111111);
  gun.moveTo(0, 0.3);
  gun.lineTo(1.8, 0.3);
  bodyGroup.addChild(gun);

  const flash = new Graphics();
  flash.beginFill(0xffddaa);
  flash.drawPolygon([1.8, 0, 3.0, -0.8, 2.6, 0, 3.0, 0.8]);
  flash.endFill();
  flash.visible = false;
  (g as any).flash = flash;
  bodyGroup.addChild(flash);

  const radius = 0.5 + Math.sqrt(index) * 1.1;
  const angle = index * 2.4;
  const jitterX = (s3 - 0.5) * 1.5;
  const jitterY = (seededRandom(unitSeed + index * 100 + 4) - 0.5) * 1.5;
  const x = Math.cos(angle) * radius + jitterX;
  const y = Math.sin(angle) * radius + jitterY;

  (g as any).originalX = x;
  (g as any).originalY = y;
  (g as any).stepPhase = s1 * 100;
  (g as any).turnSpeed = 0.05 + s2 * 0.1;
  (g as any).targetAngle = 0;
  (g as any).idlePhase = Math.random() * 100;

  g.position.set(x, y);
  return g;
}

export function ensureUnitSprite(host: MapEngine, serverUnit: { id: string; ownerId: string | undefined }): UnitSprite {
  const existing = host.unitSprites.get(serverUnit.id) as UnitSprite | undefined;
  if (existing) {
    if (!existing.combatEngagements) existing.combatEngagements = new Map();
    return existing;
  }

  const container = new Container() as UnitSprite;
  container.unitOwnerId = serverUnit.ownerId;
  container.renderedCount = -1;
  container.interactive = false;
  container.combatEngagements = new Map();

  const color = getFactionColor(serverUnit.ownerId);

  const strategic = new Graphics();
  strategic.beginFill(0x000000, 0.5);
  strategic.drawCircle(0, 1, 9);
  strategic.endFill();
  strategic.lineStyle(2, 0xffffff, 0.8);
  strategic.beginFill(color);
  strategic.drawCircle(0, 0, 8);
  strategic.endFill();
  container.addChild(strategic);
  container.strategicLayer = strategic;

  const tactical = new Container();
  tactical.visible = false;
  container.addChild(tactical);
  container.tacticalLayer = tactical;

  const barBg = new Graphics();
  barBg.beginFill(0x000000, 0.8);
  barBg.drawRect(0, 0, 18, 4);
  barBg.endFill();
  barBg.position.set(-9, -16);
  container.addChild(barBg);
  container.hpBarBg = barBg;

  const barFg = new Graphics();
  barFg.beginFill(0x00cc44, 1.0);
  barFg.drawRect(1, 1, 16, 2);
  barFg.endFill();
  barFg.position.set(-9, -16);
  container.addChild(barFg);
  container.hpBarFg = barFg;

  host.viewport.addChild(container);
  host.unitSprites.set(serverUnit.id, container);
  return container;
}

export function updateUnitSprite(sprite: UnitSprite, serverUnit: { id?: string; hp?: number; maxHp?: number; state?: string; count?: number; ownerId?: string }): void {
  sprite.serverUnit = { ...sprite.serverUnit, ...serverUnit } as any;
  const count = serverUnit.count ?? 1;

  const maxHp = serverUnit.maxHp ?? 100;
  const ratio = Math.max(0, (serverUnit.hp ?? maxHp) / maxHp);
  if (sprite.hpBarFg) {
    sprite.hpBarFg.scale.x = ratio;
    sprite.hpBarFg.tint = ratio < 0.4 ? 0xff3333 : 0x00cc44;
  }

  if (sprite.tacticalLayer && sprite.renderedCount !== count) {
    const visualCount = Math.min(count, 30);
    const currentCount = sprite.tacticalLayer.children.length;
    const color = getFactionColor(sprite.unitOwnerId);
    const unitSeed = sprite.serverUnit?.id ? hashString(sprite.serverUnit.id) : 1;

    if (currentCount < visualCount) {
      for (let i = currentCount; i < visualCount; i++) {
        const soldier = createSoldier(i, color, unitSeed);
        sprite.tacticalLayer.addChild(soldier);
      }
    } else if (currentCount > visualCount) {
      for (let i = currentCount - 1; i >= visualCount; i--) {
        const removed = sprite.tacticalLayer.removeChildAt(i);
        removed.destroy();
      }
    }

    sprite.renderedCount = count;
  }
}

export function updateTacticalVisuals(host: MapEngine, sprite: UnitSprite, zoom: number, now: number) {
  if (!sprite.strategicLayer || !sprite.tacticalLayer) return;

  const SHOW_TACTICAL = zoom > 1.2;
  sprite.strategicLayer.visible = !SHOW_TACTICAL;
  sprite.tacticalLayer.visible = SHOW_TACTICAL;

  if (SHOW_TACTICAL) {
    const isMoving = sprite.serverUnit?.state === 'MOVING';
    const isCombat = sprite.serverUnit?.state === 'COMBAT';
    const time = now / 120;

    for (const [id, lastSeen] of sprite.combatEngagements) {
      if (now - lastSeen > 2000) sprite.combatEngagements.delete(id);
    }
    const activeTargets = Array.from(sprite.combatEngagements.keys());

    let desiredAngle = sprite.moveHeading ?? sprite.rotation;

    sprite.tacticalLayer.children.forEach((soldier: any, idx) => {
      let targetFound = false;

      if (activeTargets.length > 0 && isCombat) {
        const targetId = activeTargets[idx % activeTargets.length];
        const target = host.unitSprites.get(targetId);
        if (target) {
          desiredAngle = Math.atan2(target.y - sprite.y, target.x - sprite.x);
          targetFound = true;
        }
      }

      if (isMoving || targetFound) {
        soldier.rotation = lerpAngle(soldier.rotation, desiredAngle, soldier.turnSpeed);
      }

      if (isMoving) {
        const legSpeed = time + soldier.stepPhase;
        soldier.footL.x = -0.4 + Math.sin(legSpeed) * 0.4;
        soldier.footR.x = 0.4 + Math.sin(legSpeed + Math.PI) * 0.4;
        soldier.bodyGroup.y = Math.abs(Math.sin(legSpeed)) * 0.2;
        soldier.bodyGroup.scale.set(1, 1);
      } else {
        const breath = Math.sin(now / 400 + soldier.idlePhase) * 0.03;
        soldier.bodyGroup.scale.set(1, 1 + breath);
        soldier.bodyGroup.y = 0;
        soldier.footL.x = -0.4;
        soldier.footR.x = 0.4;
      }

      if (isCombat) {
        if (Math.random() < 0.03) {
          soldier.flash.visible = true;
          soldier.bodyGroup.x = -0.8;
        } else {
          soldier.flash.visible = false;
          soldier.bodyGroup.x = soldier.bodyGroup.x * 0.7;
        }
      } else {
        soldier.flash.visible = false;
        soldier.bodyGroup.x = 0;
      }
    });
  }
}

export function handleGameTick(host: MapEngine, data: ServerGameTick) {
  for (const serverUnit of data.units) {
    const sprite = ensureUnitSprite(host, serverUnit);
    updateUnitSprite(sprite, serverUnit);
    if (serverUnit.state !== 'COMBAT') sprite.combatEngagements.clear();
  }

  host.activeSegments.clear();
  for (const seg of data.segments) {
    host.activeSegments.set(seg.unitId, seg);
    const sprite = host.unitSprites.get(seg.unitId);
    if (sprite && seg.durationMs === 0) {
      sprite.position.set(seg.start.x, seg.start.y);
    }
  }
}

export function flashUnit(host: MapEngine, unitId: string) {}
