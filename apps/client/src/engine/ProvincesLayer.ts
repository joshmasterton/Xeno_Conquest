import { Graphics, Container } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { type Territory, type RoadNode, getFactionColor } from '@xeno/shared';

export class ProvincesLayer {
  public container: Container;
  private polygons: Graphics;
  private highlightGraphics: Graphics;
  private items: Territory[] = [];
  private ownerMap = new Map<string, string>();

  constructor(viewport: Viewport) {
    this.container = new Container();
    viewport.addChild(this.container);

    this.polygons = new Graphics();
    this.container.addChild(this.polygons);

    this.highlightGraphics = new Graphics();
    this.container.addChild(this.highlightGraphics);
  }

  setVisible(v: boolean) {
    this.container.visible = v;
  }

  destroy() {
    if (this.container.parent) this.container.parent.removeChild(this.container);
    this.container.destroy({ children: true });
  }

  public setProvinces(data: Territory[]) {
    this.items = data;
    this.drawPolygons();
  }

  public updateNodes(nodes: RoadNode[]) {
    this.ownerMap.clear();
    nodes.forEach((n) => {
      if (n.ownerId) this.ownerMap.set(n.id, n.ownerId);
    });
    this.drawPolygons();
  }

  public hitTest(x: number, y: number): Territory | null {
    for (const t of this.items) {
      if (t.isWater) continue;
      const legacyContour = (t as any).contour as [number, number][] | undefined;
      const contours = t.contours || (legacyContour ? [legacyContour] : []);
      for (const contour of contours) {
        if (contour && contour.length >= 3 && this.isPointInPolygon(x, y, contour)) {
          return t;
        }
      }
    }
    return null;
  }

  public highlight(t: Territory | null) {
    this.highlightGraphics.clear();
    if (!t) return;

    const legacyContour = (t as any).contour as [number, number][] | undefined;
    const contours = t.contours || (legacyContour ? [legacyContour] : []);

    this.highlightGraphics.lineStyle(3, 0xffaa00, 1);
    this.highlightGraphics.beginFill(0xffaa00, 0.1);

    for (const contour of contours) {
      if (!contour || contour.length < 3) continue;
      const [sx, sy] = contour[0];
      this.highlightGraphics.moveTo(sx, sy);
      for (let i = 1; i < contour.length; i++) {
        const [cx, cy] = contour[i];
        this.highlightGraphics.lineTo(cx, cy);
      }
      this.highlightGraphics.lineTo(sx, sy);
    }

    this.highlightGraphics.endFill();
  }

  private drawPolygons() {
    this.polygons.clear();
    for (const t of this.items) {
      const legacyContour = (t as any).contour as [number, number][] | undefined;
      const contours = t.contours || (legacyContour ? [legacyContour] : []);
      if (!contours.length) continue;

      const owner = this.ownerMap.get(t.id);
      const fillColor = owner ? getFactionColor(owner) : parseInt(t.id.slice(1), 16);
      const alpha = owner ? 0.5 : 0.2;
      this.polygons.beginFill(fillColor, alpha);
      this.polygons.lineStyle(2, 0x000000, 0.8);

      for (const contour of contours) {
        if (contour.length < 3) continue;
        const [sx, sy] = contour[0];
        this.polygons.moveTo(sx, sy);
        for (let i = 1; i < contour.length; i++) {
          const [cx, cy] = contour[i];
          this.polygons.lineTo(cx, cy);
        }
        this.polygons.lineTo(sx, sy);
      }
      this.polygons.endFill();
    }
  }

  // Ray-casting point-in-polygon
  private isPointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];

      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
}
