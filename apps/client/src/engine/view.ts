import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { ServerGameTick } from '@xeno/shared';
import { getFactionColor } from '@xeno/shared';
import type { MapEngine } from './MapEngine';

// ✅ UPDATED: UnitSprite is now a Container holding layers
export type UnitSprite = Container & {
  hpBarBg?: Graphics;
  hpBarFg?: Graphics;
  combatIcon?: Graphics;
  countLabel?: Text;
  
  // New Layers
  strategicLayer?: Graphics; // The big circle
  tacticalLayer?: Container; // The squad of soldiers
  
  // State tracking
  unitOwnerId?: string;
  serverUnit?: { count?: number; state?: string };
  renderedCount?: number; // To detect when to regenerate soldiers
  lastDirection?: number; // For rotation
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// Helper: Deterministic random for soldier placement so they don't jitter
function pseudoRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function ensureUnitSprite(host: MapEngine, serverUnit: { id: string; ownerId: string | undefined }): UnitSprite {
  const existing = host.unitSprites.get(serverUnit.id) as UnitSprite | undefined;
  if (existing) return existing;

  // 1. Create Root Container
  const container = new Container() as UnitSprite;
  container.unitOwnerId = serverUnit.ownerId;
  container.renderedCount = -1;
  container.lastDirection = 0;
  container.interactive = false; // Clicks pass through to map unless we add hitArea

  const color = getFactionColor(serverUnit.ownerId);

  // 2. Create Strategic Layer (The Abstract Circle)
  const strategic = new Graphics();
  strategic.beginFill(color);
  strategic.drawCircle(0, 0, 8);
  strategic.endFill();
  container.addChild(strategic);
  container.strategicLayer = strategic;

  // 3. Create Tactical Layer (The Soldiers)
  // Initially empty, populated in updateUnitSprite
  const tactical = new Container();
  tactical.visible = false;
  container.addChild(tactical);
  container.tacticalLayer = tactical;

  // 4. Health Bar (Attached to Root)
  const barBg = new Graphics();
  barBg.beginFill(0x222222, 0.9);
  barBg.drawRect(0, 0, 16, 3);
  barBg.endFill();
  barBg.position.set(-8, -14);
  container.addChild(barBg);
  container.hpBarBg = barBg;

  const barFg = new Graphics();
  barFg.beginFill(0x00cc44, 0.95);
  barFg.drawRect(0, 0, 16, 3);
  barFg.endFill();
  barFg.position.set(-8, -14);
  container.addChild(barFg);
  container.hpBarFg = barFg;

  // 5. Combat Icon
  const combatIcon = new Graphics();
  combatIcon.lineStyle(2, 0xff4444, 0.9);
  combatIcon.moveTo(-2, -10);
  combatIcon.lineTo(0, -6);
  combatIcon.lineTo(2, -10);
  combatIcon.lineTo(0, -4);
  combatIcon.lineTo(0, -2);
  combatIcon.visible = false;
  container.addChild(combatIcon);
  container.combatIcon = combatIcon;

  // 6. Label
  const countStyle = new TextStyle({
    fontFamily: 'Arial',
    fontSize: 36,
    fill: '#ffffff',
    fontWeight: '900',
    stroke: '#000000',
    strokeThickness: 6,
    dropShadow: true,
    dropShadowDistance: 2,
    dropShadowBlur: 2,
  });
  const countLabel = new Text('', countStyle);
  countLabel.anchor.set(0.5);
  countLabel.position.set(0, -30);
  countLabel.resolution = 2;
  countLabel.scale.set(0.33);
  container.addChild(countLabel);
  container.countLabel = countLabel;

  host.viewport.addChild(container);
  host.unitSprites.set(serverUnit.id, container);

  return container;
}

function updateUnitSprite(sprite: UnitSprite, serverUnit: { hp?: number; maxHp?: number; state?: string; count?: number; ownerId?: string }): void {
  sprite.serverUnit = serverUnit;
  const maxHp = serverUnit.maxHp ?? 100;
  const hp = serverUnit.hp ?? maxHp;
  const ratio = maxHp > 0 ? clamp01(hp / maxHp) : 0;
  const count = serverUnit.count ?? 1;

  // Update Health Bar
  if (sprite.hpBarFg) {
    sprite.hpBarFg.scale.x = ratio;
    const low = ratio < 0.3;
    sprite.hpBarFg.tint = low ? 0xff4444 : 0x00cc44;
  }

  // Update Combat Icon
  if (sprite.combatIcon) {
    sprite.combatIcon.visible = serverUnit.state === 'COMBAT';
  }

  // Update Label
  if (sprite.countLabel) {
    sprite.countLabel.text = `${count}`;
  }

  // ✅ REGENERATE TACTICAL SQUAD IF COUNT CHANGED
  if (sprite.tacticalLayer && sprite.renderedCount !== count) {
    sprite.tacticalLayer.removeChildren();
    
    // Safety cap to prevent browser crash if count is huge
    const visualCount = Math.min(count, 50); 
    const color = getFactionColor(sprite.unitOwnerId);

    for (let i = 0; i < visualCount; i++) {
      const g = new Graphics();
      
      // Calculate formation offset (Golden Angle Spiral for natural grouping)
      const radius = 3 + Math.sqrt(i) * 3.5; // Spread factor
      const angle = i * 2.4; // Golden angle-ish
      
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      // Draw Soldier (Circle)
      g.beginFill(color);
      g.drawCircle(0, 0, 2); // 2px radius soldier
      g.endFill();

      // Draw Gun (Stick)
      g.lineStyle(1.5, 0x000000, 0.8);
      g.moveTo(0, 0);
      g.lineTo(5, 0); // Gun points Right (0 radians)

      // ✅ Store the "Home" position on the graphics object itself
      (g as any).originalX = x;
      (g as any).originalY = y;
      // Add a random phase so they don't all step left/right at the exact same millisecond
      (g as any).stepPhase = Math.random() * 1000;

      g.position.set(x, y);
      sprite.tacticalLayer.addChild(g);
    }
    sprite.renderedCount = count;
  }
}

export function handleGameTick(host: MapEngine, data: ServerGameTick) {
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
      sprite.position.set(seg.start.x, seg.start.y);
    }
  }
}

// ✅ NEW: Called every frame by tick.ts to handle LOD and Animation
export function updateTacticalVisuals(sprite: UnitSprite, zoom: number, now: number) {
  if (!sprite.strategicLayer || !sprite.tacticalLayer) return;

  // 1. LOD Switch (Zoom Threshold)
  const SHOW_TACTICAL = zoom > 0.8; // Zoom level > 0.8 triggers soldiers
  
  sprite.strategicLayer.visible = !SHOW_TACTICAL;
  sprite.tacticalLayer.visible = SHOW_TACTICAL;

  // 2. Tactical Animation
  if (SHOW_TACTICAL) {
    const isMoving = sprite.serverUnit?.state === 'MOVING';
    const isCombat = sprite.serverUnit?.state === 'COMBAT';
    
    sprite.tacticalLayer.children.forEach((soldier: any, idx) => {
      // 1. MARCHING ANIMATION
      if (isMoving) {
        // Sine wave for "bobbing" walk cycle
        // Speed: now / 100
        // Amplitude: 1.5 pixels
        const offset = Math.sin((now + soldier.stepPhase) / 100) * 1.5;
        
        // Apply to Y (relative to the squad's rotation, this looks like side-to-side stepping)
        soldier.y = soldier.originalY + offset;
      } else {
        // Return to formation
        soldier.y = soldier.originalY;
      }

      // 2. MUZZLE FLASH
      if (isCombat) {
        // Random chance to flash gun
        const isFiring = Math.random() < 0.02;
        if (isFiring) {
          soldier.tint = 0xffffaa; // Flash body yellow/white
        } else {
          soldier.tint = 0xffffff; // Reset
        }
      } else {
        soldier.tint = 0xffffff;
      }
    });
  }
}

export function flashUnit(host: MapEngine, unitId: string) {
  const sprite = host.unitSprites.get(unitId);
  if (!sprite) return;
  
  const existing = host.flashTimers.get(unitId);
  if (existing) clearTimeout(existing);

  const priorHalo = host.flashHalos.get(unitId);
  if (priorHalo && priorHalo.parent) priorHalo.parent.removeChild(priorHalo);

  const halo = new Graphics();
  halo.beginFill(0xffff00, 0.45);
  halo.drawCircle(0, 0, 15); // Slightly larger
  halo.endFill();
  halo.alpha = 0.9;
  
  // Add behind everything else in the container
  sprite.addChildAt(halo, 0); 
  
  host.flashHalos.set(unitId, halo);

  const timer = window.setTimeout(() => {
    if (halo.parent) halo.parent.removeChild(halo);
    host.flashHalos.delete(unitId);
    host.flashTimers.delete(unitId);
  }, 200);
  host.flashTimers.set(unitId, timer);
}
