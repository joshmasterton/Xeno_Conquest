import { Container, Graphics } from 'pixi.js';

interface Bullet {
  sprite: Graphics;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startTime: number;
  duration: number;
}

interface Particle {
  sprite: Container | Graphics;
  vx: number;
  vy: number;
  life: number; 
  decay: number;
  rotationSpeed?: number;
  scaleSpeed?: number;
}

export class EffectSystem {
  container: Container; // Flying particles (smoke, mist)
  decalContainer: Container; // Ground stains and casings
  bullets: Bullet[] = [];
  particles: Particle[] = [];

  constructor() {
    this.container = new Container();
    this.container.zIndex = 30;

    this.decalContainer = new Container();
    this.decalContainer.zIndex = 5;
  }

  // 💀 SPAWN DEAD SOLDIER
  spawnCorpse(x: number, y: number, rotation: number, color: number) {
    const g = new Container();
    
    // Body (Flattened/Slumped)
    const body = new Graphics();
    body.beginFill(color);
    body.drawRoundedRect(-0.8, -0.6, 1.6, 1.2, 0.3);
    body.endFill();
    body.tint = 0x555555; // Dark dead color
    body.scale.set(1.0, 0.7); // Flattened on ground
    g.addChild(body);

    const head = new Graphics();
    head.beginFill(color);
    head.drawCircle(0, 0, 0.6);
    head.endFill();
    head.tint = 0x555555;
    head.position.set(0.6, 0.2); // Head crooked
    g.addChild(head);

    g.position.set(x, y);
    g.rotation = rotation;
    
    // Add blood pool under the corpse
    const pool = new Graphics();
    pool.beginFill(0x4a0000, 0.8);
    pool.drawEllipse(0, 0, 2, 1.5);
    pool.endFill();
    pool.position.set(x, y);
    pool.rotation = Math.random() * Math.PI;
    this.decalContainer.addChildAt(pool, 0);
    
    // Add corpse to decals
    this.decalContainer.addChild(g);

    // DECAY LOGIC: Fade out over 20 seconds (approx 1200 frames)
    // Add both the body and the blood pool to the particle system for fading
    this.particles.push({ sprite: g, vx: 0, vy: 0, life: 1.0, decay: 0.0008 });
    this.particles.push({ sprite: pool, vx: 0, vy: 0, life: 1.0, decay: 0.0008 });
  }

  spawnBullet(x1: number, y1: number, x2: number, y2: number) {
    const g = new Graphics();

    g.lineStyle(0.3, 0xffffff, 1);
    g.moveTo(0, 0);
    g.lineTo(1.5, 0);
    g.lineStyle(1.0, 0xffaa00, 0.2);
    g.moveTo(0, 0);
    g.lineTo(1.5, 0);

    g.position.set(x1, y1);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    g.rotation = angle;

    this.container.addChild(g);

    this.bullets.push({
      sprite: g,
      startX: x1,
      startY: y1,
      endX: x2,
      endY: y2,
      startTime: Date.now(),
      duration: 30 + Math.random() * 30,
    });

    if (Math.random() > 0.5) this.spawnShellCasing(x1, y1, angle);
    if (Math.random() > 0.5) this.spawnSmoke(x1, y1, 0.2);
  }

  spawnShellCasing(x: number, y: number, angle: number) {
    const casing = new Graphics();
    casing.beginFill(0xffd700);
    casing.drawRect(0, 0, 0.6, 0.2);
    casing.endFill();

    const ejectAngle = angle + Math.PI / 2 + (Math.random() - 0.5);
    casing.rotation = angle;
    casing.position.set(x, y);

    this.decalContainer.addChild(casing);

    this.particles.push({
      sprite: casing,
      vx: Math.cos(ejectAngle) * (0.2 + Math.random() * 0.3),
      vy: Math.sin(ejectAngle) * (0.2 + Math.random() * 0.3),
      life: 1.0,
      decay: 0.02,
      rotationSpeed: 0.5,
    });
  }

  spawnBlood(x: number, y: number) {
    // 1. FLYING MIST (CLUSTER EFFECT)
    const count = 3 + Math.floor(Math.random() * 3);
    for(let i=0; i<count; i++) {
        const p = new Graphics();
        p.beginFill(0x8a0303); 
        p.drawCircle(0, 0, 0.2 + Math.random() * 0.3); // Varied sizes
        p.endFill();
        p.position.set(x, y);
        this.container.addChild(p);
        
        const speed = 0.5 + Math.random();
        const angle = Math.random() * Math.PI * 2;

        this.particles.push({
            sprite: p,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            decay: 0.08 + Math.random() * 0.05 
        });
    }

    // 2. GROUND STAIN (Permanent-ish)
    const stain = new Graphics();
    stain.beginFill(0x550000, 0.4);
    stain.drawEllipse(0, 0, 0.5 + Math.random(), 0.3 + Math.random());
    stain.endFill();
    stain.position.set(x + (Math.random()-0.5), y + (Math.random()-0.5));
    stain.rotation = Math.random() * Math.PI * 2;
    
    this.decalContainer.addChild(stain);
    this.particles.push({ sprite: stain, vx: 0, vy: 0, life: 1.0, decay: 0.005 }); // Fades slowly
  }

  spawnDirt(x: number, y: number) {
    const p = new Graphics();
    p.beginFill(0x8b5a2b, 0.4);
    p.drawCircle(0, 0, 0.3);
    p.endFill();
    p.position.set(x, y);
    this.container.addChild(p);
    this.particles.push({
      sprite: p,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      life: 1.0,
      decay: 0.1,
    });
  }

  spawnSmoke(x: number, y: number, size: number) {
    const p = new Graphics();
    p.beginFill(0xaaaaaa, 0.3);
    p.drawCircle(0, 0, 0.8 * size);
    p.endFill();
    p.position.set(x, y);
    this.container.addChild(p);
    
    this.particles.push({
        sprite: p,
        vx: (Math.random()-0.5)*0.05,
        vy: (Math.random()-0.5)*0.05,
        life: 1.0,
        decay: 0.02,
        scaleSpeed: 0.02 // Grow over time
    });
  }

  update() {
    const now = Date.now();

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const elapsed = now - b.startTime;
      if (elapsed >= b.duration) {
        if (Math.random() > 0.3) {
          this.spawnBlood(b.endX, b.endY);
        } else {
          this.spawnDirt(b.endX, b.endY);
        }
        b.sprite.parent?.removeChild(b.sprite);
        b.sprite.destroy();
        this.bullets.splice(i, 1);
      } else {
        const t = elapsed / b.duration;
        b.sprite.position.set(
          b.startX + (b.endX - b.startX) * t,
          b.startY + (b.endY - b.startY) * t,
        );
      }
    }

    // Particle Update Loop (Handles decay for blood, smoke, AND corpses)
    for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= p.decay;
        
        if (p.life <= 0) {
            p.sprite.parent?.removeChild(p.sprite);
            p.sprite.destroy();
            this.particles.splice(i, 1);
        } else {
            p.sprite.x += p.vx;
            p.sprite.y += p.vy;
            p.sprite.alpha = p.life;
            if (p.rotationSpeed) p.sprite.rotation += p.rotationSpeed;
            if (p.scaleSpeed) {
                p.sprite.scale.x += p.scaleSpeed;
                p.sprite.scale.y += p.scaleSpeed;
            }
            if(p.decay < 0.01) { p.vx *= 0.9; p.vy *= 0.9; } // Friction for ground items
        }
    }
  }
}
