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
  sprite: Graphics;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  rotationSpeed?: number;
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
    const count = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const p = new Graphics();
      p.beginFill(0x990000);
      p.drawCircle(0, 0, 0.1 + Math.random() * 0.15);
      p.endFill();
      p.position.set(x, y);
      this.container.addChild(p);
      this.particles.push({
        sprite: p,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        life: 1.0,
        decay: 0.15,
      });
    }

    const stain = new Graphics();
    stain.beginFill(0x550000, 0.3);
    const w = 0.4 + Math.random() * 0.4;
    const h = 0.2 + Math.random() * 0.2;
    stain.drawEllipse(0, 0, w, h);
    stain.endFill();

    const jitterX = (Math.random() - 0.5) * 1.5;
    const jitterY = (Math.random() - 0.5) * 1.5;
    stain.position.set(x + jitterX, y + jitterY);
    stain.rotation = Math.random() * Math.PI * 2;

    this.decalContainer.addChild(stain);
    this.particles.push({ sprite: stain, vx: 0, vy: 0, life: 1, decay: 0.02 });
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
    p.beginFill(0xaaaaaa, 0.15);
    p.drawCircle(0, 0, 0.8 * size);
    p.endFill();
    p.position.set(x, y);
    this.container.addChild(p);
    this.particles.push({
      sprite: p,
      vx: (Math.random() - 0.5) * 0.05,
      vy: (Math.random() - 0.5) * 0.05,
      life: 1.0,
      decay: 0.05,
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
        if (p.decay < 0.01) {
          p.vx *= 0.9;
          p.vy *= 0.9;
        }
      }
    }
  }
}
