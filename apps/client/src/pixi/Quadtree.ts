// Lightweight quadtree stub to cull objects by viewport bounds. Can be swapped for a full implementation later.
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HasPoint {
  id: string;
  x: number;
  y: number;
}

export class Quadtree<T extends HasPoint> {
  private items: T[] = [];

  insert(item: T) {
    this.items.push(item);
  }

  clear() {
    this.items = [];
  }

  query(bounds: Bounds): T[] {
    const x2 = bounds.x + bounds.width;
    const y2 = bounds.y + bounds.height;
    return this.items.filter((item) => item.x >= bounds.x && item.x <= x2 && item.y >= bounds.y && item.y <= y2);
  }
}
