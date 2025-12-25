import { Graphics, Container } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { provinces, type Territory } from '@xeno/shared';

export class ProvincesLayer {
  public container: Container;
  private polygons: Graphics;
  private hover: Graphics;
  private items: Territory[];
  private onOrder: (territoryId: string) => void;

  constructor(viewport: Viewport, onOrder: (territoryId: string) => void) {
    this.container = new Container();
    this.polygons = new Graphics();
    this.hover = new Graphics();
    this.items = provinces as Territory[];
    this.onOrder = onOrder;

    this.drawPolygons();

    // Interactive hover + click
    this.container.interactive = true;
    this.container.on('pointermove', (e: any) => {
      const p = e.data.global;
      const nearest = this.findNearestProvince(p.x, p.y);
      this.drawHover(nearest);
    });
    this.container.on('pointerdown', (e: any) => {
      const p = e.data.global;
      const nearest = this.findNearestProvince(p.x, p.y);
      if (!nearest || nearest.isWater) return;
      this.onOrder(nearest.id);
    });

    this.container.addChild(this.polygons);
    this.container.addChild(this.hover);
    viewport.addChild(this.container);
  }

  setVisible(v: boolean) {
    this.container.visible = v;
  }

  destroy() {
    if (this.container.parent) this.container.parent.removeChild(this.container);
    this.container.destroy({ children: true });
  }

  private drawPolygons() {
    this.polygons.clear();
    for (const t of this.items) {
      // Handle the new 'contours' array (multi-islands)
      const contours = t.contours;
      if (!contours || contours.length === 0) continue;

      const hexColor = parseInt(t.id.slice(1), 16);

      // SUPREMACY STYLE: Light fill so terrain shows through, dark opaque borders
      this.polygons.beginFill(hexColor, 0.2);
      this.polygons.lineStyle(2, 0x000000, 0.8);

      for (const contour of contours) {
        if (!contour || contour.length < 3) continue;
        const [sx, sy] = contour[0];
        this.polygons.moveTo(sx, sy);
        for (let i = 1; i < contour.length; i++) {
          const [x, y] = contour[i];
          this.polygons.lineTo(x, y);
        }
        this.polygons.lineTo(sx, sy); // Close the loop
      }
      this.polygons.endFill();
    }
  }

  private drawHover(t: Territory | null) {
    this.hover.clear();
    if (!t) return;
    if (t.contours && t.contours.length > 0) {
      this.hover.lineStyle(3, 0xffff00, 0.8);
      for (const contour of t.contours) {
        if (!contour || contour.length < 3) continue;
        const [sx, sy] = contour[0];
        this.hover.moveTo(sx, sy);
        for (let i = 1; i < contour.length; i++) {
          const [x, y] = contour[i];
          this.hover.lineTo(x, y);
        }
        this.hover.lineTo(sx, sy);
      }
    } else {
      this.hover.lineStyle(3, 0xffff00, 0.8);
      this.hover.drawCircle(t.x, t.y, Math.max(22, Math.min(124, t.radius + 2)));
    }
  }

  private findNearestProvince(x: number, y: number): Territory | null {
    let best: Territory | null = null;
    let bestD2 = Infinity;
    for (const t of this.items) {
      const dx = x - t.x;
      const dy = y - t.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = t; }
    }
    return best;
  }
}
