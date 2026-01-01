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

export class EffectSystem {
  container: Container;
  bullets: Bullet[] = [];

  constructor() {
    this.container = new Container();
    // Ensure bullets appear above the map but below labels
    this.container.zIndex = 10;
  }

  spawnBullet(x1: number, y1: number, x2: number, y2: number) {
    const g = new Graphics();
    g.lineStyle(2, 0xffff00, 0.8); // Bright yellow tracer
    g.moveTo(0, 0);
    g.lineTo(8, 0); // 8px long bullet

    // Randomize start/end slightly so they don't look like a laser beam
    const spread = () => (Math.random() - 0.5) * 15;

    const sx = x1 + spread();
    const sy = y1 + spread();
    const ex = x2 + spread();
    const ey = y2 + spread();

    g.position.set(sx, sy);

    // Rotate bullet to face target
    const angle = Math.atan2(ey - sy, ex - sx);
    g.rotation = angle;

    this.container.addChild(g);

    this.bullets.push({
      sprite: g,
      startX: sx,
      startY: sy,
      endX: ex,
      endY: ey,
      startTime: Date.now(),
      duration: 150 + Math.random() * 100, // Fast shot (150-250ms)
    });
  }

  update() {
    const now = Date.now();
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const elapsed = now - b.startTime;

      if (elapsed >= b.duration) {
        // Bullet hit
        b.sprite.parent?.removeChild(b.sprite);
        b.sprite.destroy();
        this.bullets.splice(i, 1);
      } else {
        // Lerp position
        const t = elapsed / b.duration;
        const cx = b.startX + (b.endX - b.startX) * t;
        const cy = b.startY + (b.endY - b.startY) * t;
        b.sprite.position.set(cx, cy);
      }
    }
  }
}
