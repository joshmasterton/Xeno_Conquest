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

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
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
    wanderBehavior.weight = 0.5; // Higher default for natural idle movement
    vehicle.steering.add(wanderBehavior);

    // E. Flee (Panic Retreat) - Disabled by default
    const fleeBehavior = new YUKA.FleeBehavior(new YUKA.Vector3(0, 0, 0), 2.0);
    fleeBehavior.weight = 0.0;
    vehicle.steering.add(fleeBehavior);

    manager.add(vehicle);
    
    // Link for easy access
    (g as any).vehicle = vehicle;
    (g as any).behaviors = {
        arrive: arriveBehavior,
        separation: separationBehavior,
        alignment: alignmentBehavior,
        wander: wanderBehavior,
        flee: fleeBehavior
    };

    // --- GAMEPLAY STATS ---
    (g as any).stepPhase = s1 * 100;       
    (g as any).turnSpeed = 0.15; 
    (g as any).idlePhase = Math.random() * 100;
    (g as any).aimAngle = 0; // Independent head rotation
    (g as any).morale = 1.0; // Start at full morale

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

export function updateTacticalVisuals(host: MapEngine, sprite: UnitSprite, zoom: number, now: number, delta: number) {
  if (!sprite.strategicLayer || !sprite.tacticalLayer || !sprite.entityManager) return;

  const SHOW_TACTICAL = zoom > 1.2;
  sprite.strategicLayer.visible = !SHOW_TACTICAL;
  sprite.tacticalLayer.visible = SHOW_TACTICAL;

  if (SHOW_TACTICAL) {
    const isMoving = sprite.serverUnit?.state === 'MOVING';
    const isCombat = sprite.serverUnit?.state === 'COMBAT';
    const time = now / 150; 

    // ✅ STEP 1: DYNAMIC BEHAVIOR TUNING WITH SMOOTH TRANSITIONS
    // Define target weights based on squad state
    let targetArrive = 0.8;
    let targetAlign = 0.0;
    let targetSep = 1.0;
    let targetWander = 0.2;
    let targetFlee = 0.0;
    let maxSpeed = 0.3;

    if (isMoving) {
        // MARCHING: Strict formation, flow together
        targetArrive = 2.5;  targetAlign = 1.5;  targetSep = 2.0;  targetWander = 0.0;
        maxSpeed = 1.2;
    } else if (isCombat) {
        // COMBAT: Loose formation, stress movement
        targetArrive = 0.5;  targetAlign = 0.0;  targetSep = 3.0;  targetWander = 0.5;
        maxSpeed = 0.5;
    } else {
        // IDLE: Slight wander for life, but slow
        targetArrive = 1.0;  targetAlign = 0.0;  targetSep = 1.2;  targetWander = 0.3;
        maxSpeed = 0.2;
    }

    // Apply smooth behavior blending to every soldier
    const soldiers = sprite.tacticalLayer.children as any[];
    const blendRate = 0.05; // 5% change per frame for smooth transitions
    
    soldiers.forEach(s => {
        if (!s.behaviors) return;

        // Check Morale for Panic Override
        let actualTargetArrive = targetArrive;
        let actualTargetFlee = targetFlee;
        
        if (s.morale < 0.3 && isCombat) {
            // PANIC MODE: Ignore formation, run away!
            actualTargetArrive = 0.0;
            actualTargetFlee = 4.0; // High priority flee
            targetSep = 5.0; // Scatter!
        }

        // Smooth blend weights toward targets (prevents snapping)
        s.behaviors.arrive.weight = lerp(s.behaviors.arrive.weight, actualTargetArrive, blendRate);
        s.behaviors.alignment.weight = lerp(s.behaviors.alignment.weight, targetAlign, blendRate);
        s.behaviors.separation.weight = lerp(s.behaviors.separation.weight, targetSep, blendRate);
        s.behaviors.wander.weight = lerp(s.behaviors.wander.weight, targetWander, blendRate);
        s.behaviors.flee.weight = lerp(s.behaviors.flee.weight, actualTargetFlee, blendRate);
        
        // Smooth speed transitions
        s.vehicle.maxSpeed = lerp(s.vehicle.maxSpeed, maxSpeed, blendRate);
    });

    // ✅ STEP 2: YUKA PHYSICS UPDATE (using global delta)
    const safeDelta = Math.min(delta, 0.1);
    sprite.entityManager.update(safeDelta);

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

      // --- AIMING & ROTATION ---
      
      let targetLegAngle = soldier.rotation;
      let targetFound = false;
      let angleToEnemy = 0;

      // 1. Find Target (World Space)
      if (activeTargets.length > 0 && isCombat) {
          const targetId = activeTargets[idx % activeTargets.length];
          const target = host.unitSprites.get(targetId);
          if (target) {
              const globalX = sprite.x + soldier.x;
              const globalY = sprite.y + soldier.y;
              angleToEnemy = Math.atan2(target.y - globalY, target.x - globalX);
              targetFound = true;
          }
      }

      // 2. Leg Rotation (Base Stance)
      const v = soldier.vehicle.velocity;
      const speed = v.length();
      
      if (speed > 0.05) {
          // Physics movement
          targetLegAngle = Math.atan2(v.y, v.x);
      } else if (isMoving && baseHeading !== undefined) {
          // Marching direction
          targetLegAngle = baseHeading;
      } else if (targetFound) {
          // Combat Stance: Face enemy
          targetLegAngle = angleToEnemy;
      } else {
          // IDLE: Random 360 Scan
          if (now > soldier.nextLookTime) {
              // Pick new random angle (Full Circle)
              soldier.targetLookAngle = (Math.random() - 0.5) * Math.PI * 2;
              // Hold for 2-5 seconds
              soldier.nextLookTime = now + 2000 + Math.random() * 3000;
          }
          targetLegAngle = soldier.targetLookAngle;
      }
      
      // Smooth Leg Turn
      soldier.rotation = lerpAngle(soldier.rotation, targetLegAngle, 0.08); // Slower, relaxed turn

      // 3. Aiming Logic (Body Offset)
      let desiredAbsAim = targetFound ? angleToEnemy : soldier.rotation;
      
      // Interpolate Absolute Aim
      let absAimAngle = lerpAngle(soldier.lastAbsRotation || soldier.rotation, desiredAbsAim, 0.2);
      soldier.lastAbsRotation = absAimAngle;

      // Apply Relative Rotation
      soldier.bodyGroup.rotation = absAimAngle - soldier.rotation;


      // --- ANIMATION ---
      const isWalking = speed > 0.1 || isMoving;

      if (isWalking) {
        const legSpeed = time + soldier.stepPhase;
        soldier.footL.x = -0.4 + Math.sin(legSpeed) * 0.4; 
        soldier.footR.x = 0.4 + Math.sin(legSpeed + Math.PI) * 0.4; 
        soldier.bodyGroup.y = Math.abs(Math.sin(legSpeed)) * 0.15;
        soldier.bodyGroup.scale.set(1, 1);
      } else {
        const breath = Math.sin(now / 500 + soldier.idlePhase) * 0.02;
        soldier.bodyGroup.scale.set(1, 1 + breath);
        soldier.bodyGroup.y = 0;
        soldier.footL.x = -0.4;
        soldier.footR.x = 0.4;
      }

      // Recoil
      if (isCombat && targetFound) {
        if (Math.random() < 0.02) { 
           soldier.flash.visible = true;
           // Recoil is relative to the BODY rotation
           // Local recoil is always "backwards" (-x) relative to bodyGroup
           soldier.bodyGroup.x = -0.8; 
        } else {
           soldier.flash.visible = false;
           soldier.bodyGroup.x *= 0.6; // Recover
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
