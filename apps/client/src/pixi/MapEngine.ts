import { Application, Graphics, Container, Sprite, Texture } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { Territory, Point, MovementIntent } from "@xeno/shared";
import { Quadtree, Bounds } from "./Quadtree";
import waterMaskUrl from "../assets/water_mask.png";

export class MapEngine {
  private app: Application;
  private viewport: Viewport;
  private resizeObserver?: ResizeObserver;
  private terrainLayer: Container;
  private territoryLayer: Container;
  private unitLayer: Container;
  private unitQuadtree = new Quadtree<{ id: string; x: number; y: number }>();
  private movements: MovementIntent[] = [];
  private mapClickCallback?: (worldPos: Point) => void;
  private unitClickCallback?: (unitId: string) => void;
  private territoryClickCallback?: (territoryId: string) => void;
  private currentLOD: 'macro' | 'mid' | 'micro' = 'mid';
  private territories: Territory[] = [];
  private selectedTerritoryId: string | null = null;
  private unitCounts: Map<string, number> = new Map();

  constructor(private container: HTMLElement) {
    console.log('[MapEngine] Constructing, container size:', container.clientWidth, 'x', container.clientHeight);
    this.app = new Application({
      background: "#0a0514", // Deep purple-black alien sky
      resizeTo: container,
      antialias: true,
      eventMode: 'none',
    });

    container.appendChild(this.app.view as HTMLCanvasElement);
    console.log('[MapEngine] Canvas added to DOM');
    
    // Completely disable Pixi event system
    (this.app.stage as any).eventMode = 'none';
    (this.app.stage as any).interactiveChildren = false;
    if (this.app.renderer.events) {
      this.app.renderer.events.destroy();
    }

    this.viewport = new Viewport({
      screenWidth: container.clientWidth || window.innerWidth,
      screenHeight: container.clientHeight || window.innerHeight,
      worldWidth: 2500,
      worldHeight: 2500,
      disableOnContextMenu: true,
    } as any);
    
    // Manually set interaction manager to avoid isInteractive errors
    (this.viewport as any).interactive = false;
    (this.viewport as any).interactiveChildren = false;

    // Setup manual drag/zoom using DOM events to avoid Pixi event issues
    const canvas = this.app.view as HTMLCanvasElement;
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;
    
    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    
    canvas.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        this.viewport.x += dx;
        this.viewport.y += dy;
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });
    
    canvas.addEventListener('mouseup', () => {
      isDragging = false;
    });
    
    canvas.addEventListener('mouseleave', () => {
      isDragging = false;
    });
    
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const direction = e.deltaY > 0 ? -0.1 : 0.1;
      const newScale = Math.max(0.1, Math.min(3, this.viewport.scale.x + direction));
      this.viewport.setZoom(newScale, true);
      this.updateLOD(newScale);
    });

    // Unified click handler - checks units, territories, then map in order
    canvas.addEventListener('click', (e) => {
      if (!this.viewport.parent) return;
      
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const world = this.viewport.toWorld({ x: screenX, y: screenY });
      
      // 1. Check if clicked on a unit (highest priority)
      for (const child of this.unitLayer.children) {
        if (child instanceof Graphics && child.name) {
          const dx = child.position.x - world.x;
          const dy = child.position.y - world.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 20) {
            this.unitClickCallback?.(child.name);
            return;
          }
        }
      }
      
      // 2. Check if clicked on a territory
      const territory = this.findTerritoryAtPoint(world);
      if (territory) {
        this.selectTerritory(territory.id);
        this.territoryClickCallback?.(territory.id);
        // Also trigger map click for movement
        this.mapClickCallback?.(world);
        return;
      }
      
      // 3. Otherwise it's just a map click
      this.mapClickCallback?.(world);
    });
    
    this.terrainLayer = new Container();
    this.territoryLayer = new Container();
    this.unitLayer = new Container();
    
    this.viewport.addChild(this.terrainLayer);
    this.viewport.addChild(this.territoryLayer);
    this.viewport.addChild(this.unitLayer);
    this.app.stage.addChild(this.viewport as any);

    this.handleResize = this.handleResize.bind(this);
    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(container);

    this.app.ticker.add(this.tick);
  }

  private handleResize() {
    this.viewport.resize(
      this.container.clientWidth || window.innerWidth,
      this.container.clientHeight || window.innerHeight,
      this.viewport.worldWidth,
      this.viewport.worldHeight
    );
  }

  destroy() {
    this.app.ticker.remove(this.tick);
    this.resizeObserver?.disconnect();
    this.viewport.destroy();
    this.app.destroy(true, { children: true, texture: true, baseTexture: true });
    const canvas = this.container.querySelector("canvas");
    if (canvas) {
      canvas.remove();
    }
  }

  async loadHeightmapTerrain() {
    console.log('[MapEngine] Loading water mask terrain...');
    
    // Load water mask image
    const img = new Image();
    img.src = waterMaskUrl;
    
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    
    console.log(`[MapEngine] Water mask loaded: ${img.width}x${img.height}`);
    
    // Create canvas to convert water mask to land/water colors
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    
    // Convert mask to colored terrain
    const terrainData = ctx.createImageData(img.width, img.height);
    
    for (let i = 0; i < imageData.data.length; i += 4) {
      const maskValue = imageData.data[i]; // Grayscale: 255 = water (white), 0 = land (black)
      
      if (maskValue > 127) {
        // Alien water - toxic cyan/purple with depth variation
        const depth = (maskValue - 127) / 128; // 0 = shallow, 1 = deep
        terrainData.data[i] = Math.floor(45 + depth * 25);     // R: 45-70
        terrainData.data[i + 1] = Math.floor(85 + depth * 40); // G: 85-125 (cyan/teal)
        terrainData.data[i + 2] = Math.floor(115 + depth * 55); // B: 115-170 (purple undertone)        
      } else {
        // Alien vegetation - purple/magenta gradient based on elevation
        const elevation = maskValue / 127; // 0 = sea level, 1 = high ground
        if (elevation < 0.3) {
          // Lowlands - deep purple fungal forests
          terrainData.data[i] = Math.floor(95 + elevation * 40);      // R: 95-135 (purple)
          terrainData.data[i + 1] = Math.floor(45 + elevation * 50);  // G: 45-95 (dark)
          terrainData.data[i + 2] = Math.floor(110 + elevation * 50); // B: 110-160 (purple)
        } else if (elevation < 0.6) {
          // Mid elevation - magenta crystalline plains
          terrainData.data[i] = Math.floor(135 + elevation * 30);     // R: 135-165 (magenta)
          terrainData.data[i + 1] = Math.floor(65 + elevation * 35);  // G: 65-100
          terrainData.data[i + 2] = Math.floor(125 + elevation * 30); // B: 125-155 (purple)
        } else {
          // Highlands - bright alien flora with bio-luminescence
          terrainData.data[i] = Math.floor(155 + elevation * 40);     // R: 155-195 (bright magenta)
          terrainData.data[i + 1] = Math.floor(85 + elevation * 50);  // G: 85-135 (pink)
          terrainData.data[i + 2] = Math.floor(145 + elevation * 45); // B: 145-190 (purple-pink)
        }
      }
      terrainData.data[i + 3] = 255; // Full opacity
    }
    
    ctx.putImageData(terrainData, 0, 0);
    
    // Create Pixi texture from canvas
    const texture = Texture.from(canvas);
    const terrainSprite = new Sprite(texture);
    
    // Scale to world size (2500x2500)
    const worldWidth = this.viewport.worldWidth;
    const worldHeight = this.viewport.worldHeight;
    terrainSprite.width = worldWidth;
    terrainSprite.height = worldHeight;
    terrainSprite.position.set(0, 0);
    
    // Add to terrain layer (bottom layer)
    this.terrainLayer.removeChildren();
    this.terrainLayer.addChild(terrainSprite);
    
    console.log('[MapEngine] Water mask terrain rendered at 4K resolution');
  }

  setTerritories(territories: Territory[]) {
    console.log('[MapEngine] Setting territories:', territories.length);
    this.territories = territories;
    this.loadHeightmapTerrain(); // Load detailed terrain
    this.redrawTerritories();
  }

  setMovements(intents: MovementIntent[]) {
    this.movements = intents;
  }

  addMovement(intent: MovementIntent) {
    // Remove existing movement for this unit and add new one
    this.movements = this.movements.filter(m => m.unitId !== intent.unitId);
    this.movements.push(intent);
  }

  onMapClick(callback: (worldPos: Point) => void) {
    this.mapClickCallback = callback;
  }

  onUnitClick(callback: (unitId: string) => void) {
    this.unitClickCallback = callback;
  }
  
  onTerritoryClick(callback: (territoryId: string) => void) {
    this.territoryClickCallback = callback;
  }
  
  selectTerritory(territoryId: string | null) {
    this.selectedTerritoryId = territoryId;
    this.redrawTerritories();
  }
  
  updateUnitCounts() {
    // Count units per territory
    this.unitCounts.clear();
    
    for (const child of this.unitLayer.children) {
      if (child instanceof Graphics && child.name) {
        const territory = this.findTerritoryAtPoint(child.position);
        if (territory) {
          this.unitCounts.set(territory.id, (this.unitCounts.get(territory.id) || 0) + 1);
        }
      }
    }
    
    this.redrawTerritories();
  }
  
  private findTerritoryAtPoint(point: Point): Territory | null {
    for (const territory of this.territories) {
      // Check all polygons if available (supports disconnected islands)
      const polygonsToCheck = territory.polygons || [territory.polygon];
      for (const polygon of polygonsToCheck) {
        if (this.isPointInPolygon(point, polygon)) {
          return territory;
        }
      }
    }
    return null;
  }
  
  private isPointInPolygon(point: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      
      const intersect = ((yi > point.y) !== (yj > point.y))
        && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  highlightUnit(unitId: string | null) {
    // Update selection state and redraw all units
    this.unitLayer.children.forEach((child) => {
      if (child instanceof Graphics && child.name) {
        const wasSelected = (child as any).isSelected;
        (child as any).isSelected = child.name === unitId;
        
        // Redraw if selection state changed
        if (wasSelected !== (child as any).isSelected) {
          const ownerId = (child as any).ownerId;
          this.upsertUnit(child.name, child.position, ownerId);
        }
      }
    });
  }

  upsertUnit(id: string, position: Point, ownerId?: string) {
    let sprite = this.unitLayer.getChildByName(id) as Graphics | null;
    if (!sprite) {
      sprite = new Graphics();
      sprite.name = id;
      sprite.cursor = 'pointer';
      (sprite as any).ownerId = ownerId;
      this.unitLayer.addChild(sprite);
    }
    sprite.clear();
    
    const isPlayer = ownerId?.includes('player');
    const color = isPlayer ? 0x8d5dca : 0xca5d8d; // Purple for player, magenta for enemy
    
    // LOD-based rendering
    if (this.currentLOD === 'macro') {
      // Macro: Small dots or count badges
      sprite.beginFill(color, 1);
      sprite.drawCircle(0, 0, 4);
      sprite.endFill();
    } else if (this.currentLOD === 'mid') {
      // Mid: Squad icons with selection rings
      if ((sprite as any).isSelected) {
        sprite.lineStyle({ width: 2, color: 0xffff00, alpha: 0.9 });
        sprite.drawCircle(0, 0, 14);
      }
      
      sprite.lineStyle({ width: 2, color: 0xffffff, alpha: 0.7 });
      sprite.beginFill(color, 0.9);
      sprite.drawCircle(0, 0, 8);
      sprite.endFill();
      
      // Direction arrow
      sprite.beginFill(0xffffff, 0.8);
      sprite.moveTo(0, -6);
      sprite.lineTo(2.5, -1);
      sprite.lineTo(-2.5, -1);
      sprite.closePath();
      sprite.endFill();
    } else {
      // Micro: Detailed units with shadows
      // Shadow
      sprite.beginFill(0x000000, 0.3);
      sprite.drawEllipse(1, 12, 8, 3);
      sprite.endFill();
      
      // Selection ring
      if ((sprite as any).isSelected) {
        sprite.lineStyle({ width: 3, color: 0xffff00, alpha: 0.9 });
        sprite.drawCircle(0, 0, 18);
      }
      
      // Unit body with gradient effect
      sprite.lineStyle({ width: 2, color: 0xffffff, alpha: 0.6 });
      sprite.beginFill(color, 0.9);
      sprite.drawCircle(0, 0, 12);
      sprite.endFill();
      
      // Highlight
      sprite.beginFill(this.lightenColor(color), 0.4);
      sprite.drawCircle(-3, -3, 4);
      sprite.endFill();
      
      // Direction indicator (larger)
      sprite.beginFill(0xffffff, 0.9);
      sprite.moveTo(0, -10);
      sprite.lineTo(4, -2);
      sprite.lineTo(-4, -2);
      sprite.closePath();
      sprite.endFill();
    }
    
    sprite.position.set(position.x, position.y);
    this.unitQuadtree.insert({ id, x: position.x, y: position.y });
  }

  cullUnits(view: Bounds) {
    const visible = new Set(this.unitQuadtree.query(view).map((u) => u.id));
    this.unitLayer.children.forEach((child) => {
      if (child instanceof Graphics) {
        child.visible = visible.has(child.name || "");
      }
    });
  }

  private tick = () => {
    const now = Date.now();
    this.unitQuadtree.clear();
    let unitsMovedThisFrame = false;

    for (const intent of this.movements) {
      const duration = Math.max(intent.arrivalAt - intent.issuedAt, 1);
      const t = Math.min(Math.max((now - intent.issuedAt) / duration, 0), 1);
      const x = intent.from.x + (intent.to.x - intent.from.x) * t;
      const y = intent.from.y + (intent.to.y - intent.from.y) * t;
      
      // Get existing unit to preserve ownerId
      const existingUnit = this.unitLayer.getChildByName(intent.unitId) as Graphics;
      const ownerId = existingUnit ? (existingUnit as any).ownerId : undefined;
      this.upsertUnit(intent.unitId, { x, y }, ownerId);
      unitsMovedThisFrame = true;
    }
    
    // Update unit counts if units moved (throttled)
    if (unitsMovedThisFrame && now % 500 < 16) {
      this.updateUnitCounts();
    }

    const bounds = this.viewport.getVisibleBounds();
    this.cullUnits({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
  };

  private drawTerritory(t: Territory, lod: 'macro' | 'mid' | 'micro') {
    const g = new Graphics();
    
    // ALIEN TERRAIN BIOMES - Rich detail for close zoom
    const elevation = (t as any).elevation || 0;
    let terrainColor: number;
    
    // Alien biome gradient based on elevation
    if (elevation < -0.15) {
      // Deep toxic abyss - dark cyan with purple undertone
      terrainColor = 0x1d3d5a;
    } else if (elevation < 0) {
      // Shallow alien seas - luminescent cyan
      terrainColor = 0x3d7d9a;
    } else if (elevation < 0.15) {
      // Lowlands - dense purple fungal forests
      terrainColor = 0x6d3d7a;
    } else if (elevation < 0.35) {
      // Plains - magenta crystalline fields
      terrainColor = 0x8d5d8a;
    } else if (elevation < 0.5) {
      // Foothills - bright alien flora
      terrainColor = 0xad7daa;
    } else if (elevation < 0.65) {
      // Mountains - pink crystal formations
      terrainColor = 0xbd8dba;
    } else if (elevation < 0.8) {
      // High peaks - bioluminescent outcrops
      terrainColor = 0xcd9dca;
    } else {
      // Summit - glowing alien peaks
      terrainColor = 0xddadda;
    }
    
    // Blend with ownership color if owned (subtle tint)
    let baseColor: number;
    if (t.ownerId) {
      const ownerColor = this.hashColor(t.ownerId);
      baseColor = this.tintColor(terrainColor, ownerColor, 0.25); // 25% owner color
    } else {
      baseColor = terrainColor;
    }
    
    // Get all polygons to draw (supports disconnected islands)
    const polygonsToDraw = t.polygons || [t.polygon];
    if (polygonsToDraw.length === 0 || polygonsToDraw[0].length === 0) return g;
    
    // Selection highlight (all LODs)
    const isSelected = this.selectedTerritoryId === t.id;
    
    // LOD 0 (Macro < 0.2): Glowing borders for alien world aesthetic
    if (lod === 'macro') {
      g.lineStyle({ width: isSelected ? 2 : 1, color: isSelected ? 0xffff00 : 0x4a2d5a, alpha: isSelected ? 0.9 : 0.6 });
      if (t.ownerId) {
        const ownerColor = this.hashColor(t.ownerId);
        g.beginFill(ownerColor, 0.12);
      }
      
      // Draw all polygons (main landmass + disconnected islands)
      for (const polygon of polygonsToDraw) {
        if (polygon.length === 0) continue;
        g.moveTo(polygon[0].x, polygon[0].y);
        for (let i = 1; i < polygon.length; i++) {
          g.lineTo(polygon[i].x, polygon[i].y);
        }
        g.closePath();
      }
      
      if (t.ownerId) {
        g.endFill();
      }
      
      // Unit count badge
      const count = this.unitCounts.get(t.id) || 0;
      if (count > 0) {
        g.beginFill(0x000000, 0.7);
        g.drawCircle(t.centroid.x, t.centroid.y, 12);
        g.endFill();
        g.beginFill(0xffffff, 1);
        g.drawCircle(t.centroid.x, t.centroid.y, 10);
        g.endFill();
        // Number will be added with Text in next iteration
      }
    }
    // LOD 1 (Mid 0.2-0.8): Enhanced glowing borders
    else if (lod === 'mid') {
      g.lineStyle({ width: isSelected ? 3 : 1.5, color: isSelected ? 0xffff00 : 0x5a3d6a, alpha: isSelected ? 0.95 : 0.75 });
      if (t.ownerId) {
        const ownerColor = this.hashColor(t.ownerId);
        g.beginFill(ownerColor, 0.15);
      }
      
      // Draw all polygons (main landmass + disconnected islands)
      for (const polygon of polygonsToDraw) {
        if (polygon.length === 0) continue;
        g.moveTo(polygon[0].x, polygon[0].y);
        for (let i = 1; i < polygon.length; i++) {
          g.lineTo(polygon[i].x, polygon[i].y);
        }
        g.closePath();
      }
      
      if (t.ownerId) {
        g.endFill();
      }
      
      // Add bioluminescent inner glow for each polygon
      g.lineStyle({ width: 1.5, color: 0xbd8dca, alpha: 0.35 });
      const inset = 8;
      const centroid = t.centroid;
      for (const polygon of polygonsToDraw) {
        if (polygon.length === 0) continue;
        g.moveTo(
          polygon[0].x + (centroid.x - polygon[0].x) * (inset / 100),
          polygon[0].y + (centroid.y - polygon[0].y) * (inset / 100)
        );
        for (let i = 1; i < polygon.length; i++) {
          g.lineTo(
            polygon[i].x + (centroid.x - polygon[i].x) * (inset / 100),
            polygon[i].y + (centroid.y - polygon[i].y) * (inset / 100)
          );
        }
        g.closePath();
      }
      
      // Unit count badge
      const count = this.unitCounts.get(t.id) || 0;
      if (count > 0) {
        g.beginFill(0x1a0a2a, 0.8); // Dark purple shadow
        g.drawCircle(t.centroid.x, t.centroid.y, 16);
        g.endFill();
        g.beginFill(t.ownerId ? 0x8d5dca : 0x5a3d6a, 1); // Purple or dark purple
        g.drawCircle(t.centroid.x, t.centroid.y, 14);
        g.endFill();
      }
    }
    // LOD 2 (Micro > 0.8): Maximum detail with bioluminescence
    else {
      // Outer glow layer for bioluminescent effect
      g.lineStyle({ width: isSelected ? 6 : 3, color: isSelected ? 0xffff00 : 0x3d1d4a, alpha: isSelected ? 0.4 : 0.3 });
      for (const polygon of polygonsToDraw) {
        if (polygon.length === 0) continue;
        g.moveTo(polygon[0].x, polygon[0].y);
        for (let i = 1; i < polygon.length; i++) {
          g.lineTo(polygon[i].x, polygon[i].y);
        }
        g.closePath();
      }
      
      if (isSelected) {
        g.lineStyle({ width: 4, color: 0xffff00, alpha: 0.9 });
        for (const polygon of polygonsToDraw) {
          if (polygon.length === 0) continue;
          g.moveTo(polygon[0].x, polygon[0].y);
          for (let i = 1; i < polygon.length; i++) {
            g.lineTo(polygon[i].x, polygon[i].y);
          }
          g.closePath();
        }
      }
      
      g.lineStyle({ width: 2, color: 0x6a3d7a, alpha: 0.9 });
      if (t.ownerId) {
        const ownerColor = this.hashColor(t.ownerId);
        g.beginFill(ownerColor, 0.18);
      }
      
      // Draw all polygons (main landmass + disconnected islands)
      for (const polygon of polygonsToDraw) {
        if (polygon.length === 0) continue;
        g.moveTo(polygon[0].x, polygon[0].y);
        for (let i = 1; i < polygon.length; i++) {
          g.lineTo(polygon[i].x, polygon[i].y);
        }
        g.closePath();
      }
      
      if (t.ownerId) {
        g.endFill();
      }
    }
    
    g.eventMode = 'none';
    g.name = t.id;
    return g;
  }

  private updateLOD(scale: number) {
    let newLOD: 'macro' | 'mid' | 'micro';
    if (scale < 0.2) {
      newLOD = 'macro';
    } else if (scale < 0.8) {
      newLOD = 'mid';
    } else {
      newLOD = 'micro';
    }
    
    if (newLOD !== this.currentLOD) {
      console.log(`[MapEngine] LOD changed: ${this.currentLOD} -> ${newLOD} (scale: ${scale.toFixed(2)})`);
      this.currentLOD = newLOD;
      this.redrawTerritories();
      // Redraw all units
      this.unitLayer.children.forEach((child) => {
        if (child instanceof Graphics && child.name) {
          const ownerId = (child as any).ownerId;
          this.upsertUnit(child.name, child.position, ownerId);
        }
      });
    }
  }
  
  private redrawTerritories() {
    this.territoryLayer.removeChildren();
    this.territories.forEach((t) => {
      const graphics = this.drawTerritory(t, this.currentLOD);
      this.territoryLayer.addChild(graphics);
    });
  }
  
  private drawTerrainFeatures() {
    this.terrainLayer.removeChildren();
    
    // Improved Perlin-like noise function for continuous terrain
    const noise = (x: number, y: number, scale: number = 0.01) => {
      const xi = Math.floor(x * scale);
      const yi = Math.floor(y * scale);
      const xf = (x * scale) - xi;
      const yf = (y * scale) - yi;
      
      // Smoothstep interpolation
      const u = xf * xf * (3 - 2 * xf);
      const v = yf * yf * (3 - 2 * yf);
      
      // Pseudo-random gradients
      const hash = (i: number, j: number) => {
        const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
        return h - Math.floor(h);
      };
      
      const n00 = hash(xi, yi);
      const n10 = hash(xi + 1, yi);
      const n01 = hash(xi, yi + 1);
      const n11 = hash(xi + 1, yi + 1);
      
      const nx0 = n00 * (1 - u) + n10 * u;
      const nx1 = n01 * (1 - u) + n11 * u;
      return nx0 * (1 - v) + nx1 * v;
    };
    
    const elevation = (x: number, y: number) => {
      // Multi-octave noise for natural terrain
      let value = 0;
      let amplitude = 1;
      let frequency = 1;
      let maxValue = 0;
      
      for (let i = 0; i < 4; i++) {
        value += amplitude * noise(x, y, frequency * 0.003);
        maxValue += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }
      
      return (value / maxValue) * 2 - 1;
    };
    
    // Draw water as flowing regions - MUST match server's cellSize and sampling
    const waterGraphic = new Graphics();
    waterGraphic.lineStyle({ width: 0 });
    
    const cellSize = 10; // Match server's grid resolution
    for (let x = 0; x < 2000; x += cellSize) {
      for (let y = 0; y < 2000; y += cellSize) {
        // Sample at cell CENTER to match server logic
        const cx = x + cellSize * 0.5;
        const cy = y + cellSize * 0.5;
        const e = elevation(cx, cy);
        
        // Water in lowlands - same threshold as server
        if (e < -0.15) {
          const waterIntensity = Math.max(0.3, Math.min(0.9, ((-e - 0.15) / 0.6)));
          waterGraphic.beginFill(0x1a5a7c, waterIntensity * 0.5);
          waterGraphic.drawRect(x, y, cellSize, cellSize);
          waterGraphic.endFill();
          
          // Add subtle wave pattern
          if (e < -0.3) {
            waterGraphic.lineStyle({ width: 1, color: 0x2a7a9c, alpha: 0.3 });
            const waveHeight = 3 + (Math.sin(x * 0.05 + y * 0.05) * 2);
            waterGraphic.moveTo(x, y + waveHeight);
            waterGraphic.lineTo(x + cellSize, y + 5 - waveHeight);
          }
        }
      }
    }
    this.terrainLayer.addChild(waterGraphic);
    
    // Draw mountains as connected ranges
    const mountainGraphic = new Graphics();
    for (let x = 0; x < 2000; x += 20) {
      for (let y = 0; y < 2000; y += 20) {
        const e = elevation(x, y);
        
        if (e > 0.25) {
          const intensity = (e - 0.25) / 0.75;
          
          // Mountain body
          mountainGraphic.lineStyle({ width: 0 });
          mountainGraphic.beginFill(0x6a7a8a, 0.4 * intensity);
          mountainGraphic.drawRect(x, y, 20, 20);
          mountainGraphic.endFill();
          
          // Peak highlight for high mountains
          if (e > 0.5) {
            mountainGraphic.beginFill(0xeaffff, 0.2 * (e - 0.5) * 2);
            mountainGraphic.drawRect(x + 5, y + 5, 10, 10);
            mountainGraphic.endFill();
          }
          
          // Mountain outline
          if (e > 0.4) {
            mountainGraphic.lineStyle({ width: 1, color: 0x5a6a7a, alpha: 0.4 });
            mountainGraphic.drawRect(x, y, 20, 20);
          }
        }
      }
    }
    this.terrainLayer.addChild(mountainGraphic);
    
    // Draw craters as impact zones
    const craterGraphic = new Graphics();
    for (let x = 0; x < 2000; x += 25) {
      for (let y = 0; y < 2000; y += 25) {
        const e = elevation(x, y);
        
        if (e < -0.5) {
          // Deep crater
          craterGraphic.lineStyle({ width: 1, color: 0x3a2a1a, alpha: 0.6 });
          craterGraphic.beginFill(0x2a1a0a, 0.4);
          craterGraphic.drawCircle(x + 12.5, y + 12.5, 12);
          craterGraphic.endFill();
          
          // Crater ring
          craterGraphic.lineStyle({ width: 2, color: 0x5a4a3a, alpha: 0.5 });
          craterGraphic.drawCircle(x + 12.5, y + 12.5, 12);
        }
      }
    }
    this.terrainLayer.addChild(craterGraphic);
  }
  
  private redrawTerritories() {
    this.territoryLayer.removeChildren();
    this.territories.forEach((t) => {
      const graphics = this.drawTerritory(t, this.currentLOD);
      this.territoryLayer.addChild(graphics);
    });
  }
  
  private lightenColor(color: number): number {
    const r = Math.min(255, ((color >> 16) & 0xff) + 60);
    const g = Math.min(255, ((color >> 8) & 0xff) + 60);
    const b = Math.min(255, (color & 0xff) + 60);
    return (r << 16) | (g << 8) | b;
  }
  
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }
  
  private tintColor(baseColor: number, tintColor: number, amount: number): number {
    const r1 = (baseColor >> 16) & 0xff;
    const g1 = (baseColor >> 8) & 0xff;
    const b1 = baseColor & 0xff;
    
    const r2 = (tintColor >> 16) & 0xff;
    const g2 = (tintColor >> 8) & 0xff;
    const b2 = tintColor & 0xff;
    
    const r = Math.floor(r1 * (1 - amount) + r2 * amount);
    const g = Math.floor(g1 * (1 - amount) + g2 * amount);
    const b = Math.floor(b1 * (1 - amount) + b2 * amount);
    
    return (r << 16) | (g << 8) | b;
  }

  private hashColor(seed: string) {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash << 5) - hash + seed.charCodeAt(i);
      hash |= 0;
    }
    const r = (hash & 0xff0000) >> 16;
    const g = (hash & 0x00ff00) >> 8;
    const b = hash & 0x0000ff;
    return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
  }
}
