import { Container, Graphics, Point } from 'pixi.js';
import * as YUKA from 'yuka';
import type { ServerGameTick } from '@xeno/shared';
import { getFactionColor } from '@xeno/shared';
import type { MapEngine } from './MapEngine';

export type UnitSprite = Container & {
  hpBarBg?: Graphics;
  hpBarFg?: Graphics;
  combatIcon?: Graphics;
  
  strategicLayer?: Graphics;
  tacticalLayer?: Container;
  
  unitOwnerId?: string;
  serverUnit?: { id: string; count?: number; state?: string };
  renderedCount?: number;
  
  moveHeading?: number;
  combatEngagements: Map<string, number>;

  // YUKA Systems
  entityManager?: YUKA.EntityManager;
  time?: YUKA.Time;
};

// --- UTILS ---

function darken(color: number, percent: number): number {
    const r = (color >> 16) & 0xFF;
    const g = (color >> 8) & 0xFF;
    const b = color & 0xFF;
    return (Math.floor(r * (1 - percent)) << 16) | (Math.floor(g * (1 - percent)) << 8) | Math.floor(b * (1 - percent));
}

function lerpAngle(start: number, end: number, amount: number): number {
    let diff = end - start;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return start + diff * amount;
}

function seededRandom(seed: number): number {
    let t = seed += 0x6D2B79F5;
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

// --- SOLDIER CREATION ---

function createSoldier(i: number, color: number, unitSeed: number, manager: YUKA.EntityManager): Container {
    const baseColor = color;
    const vestColor = darken(baseColor, 0.4); 

    const s1 = seededRandom(unitSeed + i * 100 + 1); 
    const s2 = seededRandom(unitSeed + i * 100 + 2); 
    const s3 = seededRandom(unitSeed + i * 100 + 3); 

    const g = new Container();

    // --- GRAPHICS PARTS (Access individually for animation) ---
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

    // Body Group (Includes Head + Gun)
    const bodyGroup = new Container();
    g.addChild(bodyGroup);
    (g as any).bodyGroup = bodyGroup; 

    const vest = new Graphics();
    vest.beginFill(vestColor); 
    vest.drawRoundedRect(-0.8, -0.6, 1.6, 1.2, 0.3);
    vest.endFill();
    bodyGroup.addChild(vest);

    const head = new Graphics();
    head.beginFill(baseColor);
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

    // --- YUKA AI SETUP ---
    // 1. Calculate Home Position (Formation Slot)
    const radius = 0.5 + Math.sqrt(i) * 1.1; 
    const angle = i * 2.4;
    const homeX = Math.cos(angle) * radius + (s3 - 0.5);
    const homeY = Math.sin(angle) * radius + (seededRandom(unitSeed + i*100 + 4) - 0.5);

    // 2. Setup Vehicle
    const vehicle = new YUKA.Vehicle();
    vehicle.position.set(homeX, homeY, 0);
    vehicle.maxSpeed = 1.0; 
    vehicle.mass = 1.0;
    vehicle.boundingRadius = 0.5;

    // 3. Define Behaviors (We will toggle these weights in update)
    
    // A. Arrive (Hold Formation)
    const targetVector = new YUKA.Vector3(homeX, homeY, 0);
    const arriveBehavior = new YUKA.ArriveBehavior(targetVector, 2.0, 0.1);
    vehicle.steering.add(arriveBehavior);

    // B. Separation (Don't overlap neighbors)
    const separationBehavior = new YUKA.SeparationBehavior();
    separationBehavior.weight = 2.0; 
    vehicle.steering.add(separationBehavior);

    // C. Alignment (Move as a squad) - Helps fluid turns
    const alignmentBehavior = new YUKA.AlignmentBehavior();
    alignmentBehavior.weight = 0.0; // Disabled by default
    vehicle.steering.add(alignmentBehavior);

    // D. Wander (Idle restlessness / Combat stress)
    const wanderBehavior = new YUKA.WanderBehavior();
    wanderBehavior.weight = 0.1; // Subtle default
    vehicle.steering.add(wanderBehavior);

    manager.add(vehicle);
    
    // Link for easy access
    (g as any).vehicle = vehicle;
    (g as any).behaviors = {
        arrive: arriveBehavior,
        separation: separationBehavior,
        alignment: alignmentBehavior,
        wander: wanderBehavior
    };

    // --- GAMEPLAY STATS ---
    (g as any).stepPhase = s1 * 100;       
    (g as any).turnSpeed = 0.15; 
    (g as any).idlePhase = Math.random() * 100;
    (g as any).aimAngle = 0; // Independent head rotation

    g.position.set(homeX, homeY);
    
    return g;
}

// --- MAIN FUNCTIONS ---

export function ensureUnitSprite(host: MapEngine, serverUnit: { id: string; ownerId: string | undefined }): UnitSprite {
  const existing = host.unitSprites.get(serverUnit.id) as UnitSprite | undefined;
  if (existing) return existing;

  const container = new Container() as UnitSprite;
  container.unitOwnerId = serverUnit.ownerId;
  container.renderedCount = -1;
  container.interactive = false;
  container.combatEngagements = new Map();
  
  // Create Unit AI Brain
  container.entityManager = new YUKA.EntityManager();
  container.time = new YUKA.Time();

  const color = getFactionColor(serverUnit.ownerId);

  // Layers
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

export function updateUnitSprite(host: MapEngine, sprite: UnitSprite, serverUnit: { id: string; hp?: number; maxHp?: number; state?: string; count?: number; ownerId?: string }): void {
  sprite.serverUnit = serverUnit;
  const count = serverUnit.count ?? 1;

  const maxHp = serverUnit.maxHp ?? 100;
  const ratio = Math.max(0, (serverUnit.hp ?? maxHp) / maxHp);
  if (sprite.hpBarFg) {
    sprite.hpBarFg.scale.x = ratio;
    sprite.hpBarFg.tint = ratio < 0.4 ? 0xff3333 : 0x00cc44;
  }

  // SQUAD SIZE MANAGEMENT
  if (sprite.tacticalLayer && sprite.renderedCount !== count && sprite.entityManager) {
    const visualCount = Math.min(count, 30);
    const currentChildren = sprite.tacticalLayer.children;
    const currentCount = currentChildren.length;
    const color = getFactionColor(sprite.unitOwnerId);
    const unitSeed = hashString(serverUnit.id);

    // Add Soldiers
    if (currentCount < visualCount) {
        for (let i = currentCount; i < visualCount; i++) {
            const soldier = createSoldier(i, color, unitSeed, sprite.entityManager);
            sprite.tacticalLayer.addChild(soldier);
        }
    } 
    // Remove Soldiers (Death)
    else if (currentCount > visualCount) {
        const deadCount = currentCount - visualCount;
        for(let i=0; i<deadCount; i++) {
            const deadSoldier = sprite.tacticalLayer.getChildAt(sprite.tacticalLayer.children.length - 1) as any;
            
            // Unregister from Yuka
            if (deadSoldier.vehicle) sprite.entityManager.remove(deadSoldier.vehicle);

            // Spawn Corpse
            const globalPos = deadSoldier.getGlobalPosition();
            const worldPos = host.effectSystem.decalContainer.toLocal(globalPos);
            // Use current body rotation for the corpse for continuity
            const deathRot = deadSoldier.bodyGroup ? deadSoldier.bodyGroup.rotation + deadSoldier.rotation : deadSoldier.rotation;
            
            host.effectSystem.spawnCorpse(worldPos.x, worldPos.y, deathRot, color);
            sprite.tacticalLayer.removeChild(deadSoldier);
        }
    }
    sprite.renderedCount = count;
  }
}

export function updateTacticalVisuals(host: MapEngine, sprite: UnitSprite, zoom: number, now: number) {
  if (!sprite.strategicLayer || !sprite.tacticalLayer || !sprite.entityManager || !sprite.time) return;

  const SHOW_TACTICAL = zoom > 1.2;
  sprite.strategicLayer.visible = !SHOW_TACTICAL;
  sprite.tacticalLayer.visible = SHOW_TACTICAL;

  if (SHOW_TACTICAL) {
    const isMoving = sprite.serverUnit?.state === 'MOVING';
    const isCombat = sprite.serverUnit?.state === 'COMBAT';
    const time = now / 150; 

    // ✅ STEP 1: DYNAMIC BEHAVIOR TUNING
    // We adjust the AI "brain" of every soldier based on the squad state
    const soldiers = sprite.tacticalLayer.children as any[];
    
    soldiers.forEach(s => {
        if (!s.behaviors) return;

        if (isMoving) {
            // MARCHING: Strict formation, flow together
            s.behaviors.arrive.weight = 2.5;     // Stick to formation
            s.behaviors.alignment.weight = 1.0;  // Turn with group
            s.behaviors.separation.weight = 2.0; // Don't trip
            s.behaviors.wander.weight = 0.0;     // No wandering
            s.vehicle.maxSpeed = 1.2;            // Move fast
        } else if (isCombat) {
            // COMBAT: Loose formation, stress movement
            s.behaviors.arrive.weight = 0.5;     // Loose formation
            s.behaviors.alignment.weight = 0.0;  // Look at enemies, not friends
            s.behaviors.separation.weight = 3.0; // Spread out!
            s.behaviors.wander.weight = 0.5;     // Combat shuffling/stress
            s.vehicle.maxSpeed = 0.5;            // Careful movement
        } else {
            // IDLE: Relaxed
            s.behaviors.arrive.weight = 0.8;     // Loose hold
            s.behaviors.alignment.weight = 0.0;
            s.behaviors.separation.weight = 1.0;
            s.behaviors.wander.weight = 0.2;     // Subtle shifting
            s.vehicle.maxSpeed = 0.3;            // Slow shuffle
        }
    });

    // ✅ STEP 2: YUKA PHYSICS UPDATE
    const delta = sprite.time.update().getDelta(); 
    sprite.entityManager.update(Math.min(delta, 0.1));

    // Cleanup Combat Targets
    for (const [id, lastSeen] of sprite.combatEngagements) {
        if (now - lastSeen > 2000) sprite.combatEngagements.delete(id);
    }
    const activeTargets = Array.from(sprite.combatEngagements.keys());
    const baseHeading = sprite.moveHeading;

    // ✅ STEP 3: VISUAL SYNC
    soldiers.forEach((soldier, idx) => {
      // Sync Position
      if (soldier.vehicle) {
          soldier.x = soldier.vehicle.position.x;
          soldier.y = soldier.vehicle.position.y;
      }

      // --- INDEPENDENT TURRET LOGIC ---
      // The "Soldier" rotates to movement direction (Legs)
      // The "BodyGroup" rotates to aim at target (Torso/Gun)
      
      let moveAngle = soldier.rotation;
      let aimAngle = 0; // Relative to body

      // 1. Leg Rotation (Movement Direction)
      const v = soldier.vehicle.velocity;
      if (v.squaredLength() > 0.05) {
          const velocityAngle = Math.atan2(v.y, v.x);
          moveAngle = lerpAngle(soldier.rotation, velocityAngle, 0.1);
      } else if (isMoving && baseHeading !== undefined) {
          moveAngle = lerpAngle(soldier.rotation, baseHeading, 0.1);
      }
      soldier.rotation = moveAngle;

      // 2. Torso Rotation (Aiming)
      let targetFound = false;
      if (activeTargets.length > 0 && isCombat) {
          const targetId = activeTargets[idx % activeTargets.length];
          const target = host.unitSprites.get(targetId);
          if (target) {
              const absAngleToTarget = Math.atan2(target.y - soldier.y, target.x - soldier.x);
              // Convert absolute angle to local angle relative to legs
              aimAngle = absAngleToTarget - moveAngle; 
              // Normalize
              while (aimAngle > Math.PI) aimAngle -= Math.PI * 2;
              while (aimAngle < -Math.PI) aimAngle += Math.PI * 2;
              
              // Clamp torso twist (Can't rotate head 180 degrees backwards easily)
              aimAngle = Math.max(-1.5, Math.min(1.5, aimAngle));
              
              targetFound = true;
          }
      }

      // Smooth Aim
      soldier.bodyGroup.rotation = lerpAngle(soldier.bodyGroup.rotation, targetFound ? aimAngle : 0, 0.15);


      // --- ANIMATION ---
      const speed = v.length();
      const isWalking = speed > 0.1 || isMoving;

      if (isWalking) {
        const legSpeed = time + soldier.stepPhase;
        soldier.footL.x = -0.4 + Math.sin(legSpeed) * 0.4; 
        soldier.footR.x = 0.4 + Math.sin(legSpeed + Math.PI) * 0.4; 
        // Bob body based on walk
        soldier.bodyGroup.y = Math.abs(Math.sin(legSpeed)) * 0.15;
      } else {
        // Breathing
        const breath = Math.sin(now / 500 + soldier.idlePhase) * 0.02;
        soldier.bodyGroup.scale.set(1, 1 + breath);
        soldier.bodyGroup.y = 0;
        soldier.footL.x = -0.4;
        soldier.footR.x = 0.4;
      }

      // Combat Recoil
      if (isCombat && targetFound) {
        if (Math.random() < 0.02) { 
           soldier.flash.visible = true;
           // Recoil backwards relative to AIM angle
           const recoilDist = 0.8;
           soldier.bodyGroup.x = -Math.cos(aimAngle) * recoilDist;
           soldier.bodyGroup.y = -Math.sin(aimAngle) * recoilDist; // Also kick back Y local
        } else {
           soldier.flash.visible = false;
           // Recover
           soldier.bodyGroup.x *= 0.6;
           if(Math.abs(soldier.bodyGroup.y) > 0.1) soldier.bodyGroup.y *= 0.6;
        }
      } else {
        soldier.flash.visible = false;
        if (!isWalking) soldier.bodyGroup.x = 0;
      }
    });
  }
}

export function handleGameTick(host: MapEngine, data: ServerGameTick) {
  for (const serverUnit of data.units) {
    const sprite = ensureUnitSprite(host, serverUnit);
    updateUnitSprite(host, sprite, serverUnit);
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
