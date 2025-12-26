import { Application, Graphics, Sprite, Renderer } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { io, Socket } from 'socket.io-client';
import {
  worldGraph,
  WORLD_SIZE,
  EVENTS,
  provinces,
  ensureProvinceNodeId,
  type Territory,
  type RoadEdge,
  type RoadNode,
  type ServerToClientEvents,
  type ClientToServerEvents,
  type ServerGameTick,
  type MovementSegment,
} from '@xeno/shared';
import type { EventSystem } from '@pixi/events';
import { ProvincesLayer } from './ProvincesLayer';
import { setupInteraction } from './interaction';
import { handleTick } from './tick';
import { handleGameTick, flashUnit } from './view';

type RendererWithEvents = Renderer & { events: EventSystem };

export interface EngineMetrics {
  fps: number;
  zoom: number;
  unitCount: number;
  selectedUnit: string | null;
}

// ✅ NEW: Define Interaction Modes
export type InteractionMode = 'SELECT' | 'TARGETING';

// ✅ Public interface for helper modules (no 'any' casts)
export interface IMapEngineState {
  readonly viewport: Viewport;
  readonly activeSegments: Map<string, MovementSegment>;
  readonly unitSprites: Map<string, Graphics>;
  readonly flashTimers: Map<string, number>;
  readonly flashHalos: Map<string, Graphics>;
  readonly railsLayer: Graphics;
  readonly provincesLayer: ProvincesLayer | null;
  readonly selectedUnitId: string | null;
  incrementFrames(): void;
  getFrames(): number;
  getLastSample(): number;
  setLastSample(time: number): void;
  notifyMetrics(data: EngineMetrics): void;
  selectUnit(unitId: string | null): void;
}

export class MapEngine implements IMapEngineState {
  private app: Application;
  public readonly viewport: Viewport; // ✅ Public for interface
  private socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  public readonly unitSprites: Map<string, Graphics> = new Map(); // ✅ Public for interface
  public readonly activeSegments: Map<string, MovementSegment> = new Map(); // ✅ Public for interface
  public readonly flashTimers: Map<string, number> = new Map(); // ✅ Public for interface
  public readonly flashHalos: Map<string, Graphics> = new Map(); // ✅ Public for interface
  public readonly railsLayer: Graphics; // ✅ Public for interface
  public provincesLayer: ProvincesLayer | null = null; // ✅ Public for interface
  
  // Callbacks
  private metricsCb?: (m: EngineMetrics) => void;
  private onSelectionChange?: (unitId: string | null) => void;

  private frames = 0;
  private lastSample = performance.now();
  private edges: RoadEdge[] = worldGraph.edges;
  private nodesById: Map<string, RoadNode> = new Map(worldGraph.nodes.map(n => [n.id, n]));
  
  // ✅ STATE
  private interactionMode: InteractionMode = 'SELECT';
  public selectedUnitId: string | null = null; // ✅ Public for interface
  private selectedProvinceId: string | null = null;
  private nodeGraphics: Map<string, Graphics> = new Map();
  private selectionRing: Graphics | null = null;

  constructor(
    container: HTMLElement, 
    opts?: { 
      onMetrics?: (m: EngineMetrics) => void,
      onSelectionChange?: (unitId: string | null) => void 
    }
  ) {
    this.metricsCb = opts?.onMetrics;
    this.onSelectionChange = opts?.onSelectionChange;

    this.app = new Application({
      resizeTo: window,
      backgroundColor: 0x000000,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    container.appendChild(this.app.view as HTMLCanvasElement);

    const renderer = this.app.renderer as RendererWithEvents;
    this.viewport = new Viewport({
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      worldWidth: WORLD_SIZE,
      worldHeight: WORLD_SIZE,
      // Cast to avoid type mismatch across pixi-viewport versions
      events: (renderer as any).events,
    } as any);
    this.app.stage.addChild(this.viewport);

    this.viewport.drag().pinch().wheel().decelerate();

    const background = Sprite.from('/color_mask.png');
    background.position.set(0, 0);
    background.width = WORLD_SIZE;
    background.height = WORLD_SIZE;
    this.viewport.addChild(background);

    const rails = new Graphics();
    rails.lineStyle(2, 0xffffff, 0.3);
    for (const edge of this.edges) {
      const start = this.nodesById.get(edge.sourceNodeId);
      const end = this.nodesById.get(edge.targetNodeId);
      if (!start || !end) continue;
      rails.moveTo(start.x, start.y);
      rails.lineTo(end.x, end.y);
    }
    this.viewport.addChild(rails);
    this.railsLayer = rails;

    this.provincesLayer = new ProvincesLayer(this.viewport);
    // Populate provinces so borders render
    this.provincesLayer.setProvinces(provinces as Territory[]);

    // Interaction handler attached after socket setup

    // Node Dots
    const nodesLayer = new Graphics();
    for (const node of worldGraph.nodes) {
      const dot = new Graphics();
      dot.beginFill(0x4488ff);
      dot.drawCircle(node.x, node.y, 4);
      dot.endFill();
      this.viewport.addChild(dot);
      this.nodeGraphics.set(node.id, dot);
    }

    // Socket
    this.socket = io('http://localhost:3000') as Socket<ServerToClientEvents, ClientToServerEvents>;
    this.socket.on('connect', () => console.log('✅ Connected'));
    this.socket.on(EVENTS.S_GAME_TICK, (payload) => {
      this.provincesLayer?.updateNodes(payload.nodes);
      handleGameTick(this, payload);
    });
    this.socket.on(EVENTS.COMBAT_EVENT, (payload: { pairs: { aId: string; bId: string }[] }) => {
      for (const pair of payload.pairs) {
        flashUnit(this, pair.aId);
        flashUnit(this, pair.bId);
      }
    });

    this.app.ticker.add(() => handleTick(this));

    // Attach interaction handler (requires socket)
    setupInteraction({
      viewport: this.viewport,
      provincesLayer: this.provincesLayer,
      unitSprites: this.unitSprites,
      edges: this.edges,
      nodesById: this.nodesById,
      socket: this.socket as unknown as Socket,
      getInteractionMode: () => this.interactionMode,
      getSelectedUnitId: () => this.selectedUnitId,
      getSelectedProvinceId: () => this.selectedProvinceId,
      setInteractionMode: (m: InteractionMode) => this.setInteractionMode(m),
      selectUnit: (id: string | null) => this.selectUnit(id),
      setSelectedProvinceId: (id: string | null) => this.setSelectedProvinceId(id),
    });
  }

  // ✅ IMapEngineState Implementation (public API for helpers)
  incrementFrames(): void { this.frames++; }
  getFrames(): number { return this.frames; }
  getLastSample(): number { return this.lastSample; }
  setLastSample(time: number): void { this.lastSample = time; }
  notifyMetrics(data: EngineMetrics): void { this.metricsCb?.(data); }

  // ✅ HELPER: State Management (now public for interface)
  public selectUnit(unitId: string | null) {
    this.clearSelectionRing();
    this.selectedUnitId = unitId;
    this.selectedProvinceId = null;
    this.provincesLayer?.highlight(null);
    
    // Draw selection ring if selecting a unit
    if (unitId) {
      const sprite = this.unitSprites.get(unitId);
      if (sprite) {
        const ring = new Graphics();
    // Helpers moved to external modules
        this.selectionRing = ring;
      }
    }
    
    // Notify React
    if (this.onSelectionChange) this.onSelectionChange(unitId);
  }

  // ✅ PUBLIC API: Called by React Button
  public enterTargetingMode() {
    if (!this.selectedUnitId) return;
    this.setInteractionMode('TARGETING');
  }

  private setInteractionMode(mode: InteractionMode) {
    this.interactionMode = mode;
    console.log(`🔄 Interaction Mode: ${mode}`);
    
    // Update Cursor
    const canvas = this.app.view as HTMLCanvasElement;
    if (mode === 'TARGETING') {
      canvas.style.cursor = 'crosshair';
    } else {
      canvas.style.cursor = 'default';
    }
  }

  public setSelectedProvinceId(id: string | null) {
    this.selectedProvinceId = id;
  }

  private clearSelectionRing() {
    if (this.selectionRing && this.selectionRing.parent) {
      this.selectionRing.parent.removeChild(this.selectionRing);
      this.selectionRing.destroy();
      this.selectionRing = null;
    }
  }

  public destroy() {
    this.socket.disconnect();
    this.app.destroy(true, { children: true });
  }
}

