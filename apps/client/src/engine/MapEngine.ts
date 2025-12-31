import { Application, Graphics, Sprite, Renderer } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { io, Socket } from 'socket.io-client';
import {
  worldGraph,
  WORLD_SIZE,
  EVENTS,
  provinces,
  type Territory,
  type RoadEdge,
  type RoadNode,
  type ServerToClientEvents,
  type ClientToServerEvents,
  type MovementSegment,
} from '@xeno/shared';
import type { EventSystem } from '@pixi/events';
import { ProvincesLayer } from './ProvincesLayer';
import { setupInteraction } from './interaction';
import { handleTick } from './tick';
import { handleGameTick, flashUnit, type UnitSprite } from './view';
import { useGameStore } from '../store/gameStore';
import { createLabelSystem, destroyLabelSystem, syncYieldLabels, updateLabelTargets, animateLabels, type LabelSystem } from './labelSystem';

type RendererWithEvents = Renderer & { events: EventSystem };

export interface EngineMetrics {
  fps: number;
  zoom: number;
  unitCount: number;
  selectedUnit: string | null;
}
export type InteractionMode = 'SELECT' | 'TARGETING';

export class MapEngine {
  private app: Application;
  public readonly viewport: Viewport;
  private socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  public readonly unitSprites: Map<string, UnitSprite> = new Map();
  public readonly activeSegments: Map<string, MovementSegment> = new Map();
  public readonly flashTimers: Map<string, number> = new Map();
  public readonly flashHalos: Map<string, Graphics> = new Map();
  public readonly railsLayer: Graphics;
  public provincesLayer: ProvincesLayer | null = null;
  private labelSystem: LabelSystem;
  private metricsCb?: (m: EngineMetrics) => void;
  private onSelectionChange?: (unitId: string | null) => void;

  private frames = 0;
  private lastSample = performance.now();
  private edges: RoadEdge[] = worldGraph.edges;
  private nodesById: Map<string, RoadNode> = new Map(worldGraph.nodes.map((n) => [n.id, n]));
  private latestNodes: RoadNode[] = worldGraph.nodes;

  private interactionMode: InteractionMode = 'SELECT';
  public selectedUnitId: string | null = null;
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
    this.provincesLayer.setProvinces(provinces as Territory[]);
    this.labelSystem = createLabelSystem();
    for (const node of worldGraph.nodes) {
      const dot = new Graphics();
      dot.beginFill(0x4488ff);
      dot.drawCircle(node.x, node.y, 4);
      dot.endFill();
      this.viewport.addChild(dot);
      this.nodeGraphics.set(node.id, dot);
    }
    this.viewport.addChild(this.labelSystem.container);

    this.socket = io('http://localhost:3000') as Socket<ServerToClientEvents, ClientToServerEvents>;
    useGameStore.setState({
      sendBuildOrder: (nodeId: string) => this.socket.emit(EVENTS.C_BUILD_UNIT, { nodeId, unitType: 'infantry' }),
      sendUpgradeOrder: (nodeId: string) => this.socket.emit(EVENTS.C_UPGRADE_NODE, { nodeId }),
    });
    this.socket.on('connect', () => console.log('✅ Connected'));
    this.socket.on(EVENTS.S_GAME_TICK, (payload) => {
      const store = useGameStore.getState();
      const playerData = payload.players?.[store.myPlayerId];
      if (playerData) {
        store.setResources(playerData.gold, playerData.manpower);
      }

      useGameStore.setState({ nodes: payload.nodes });
      this.provincesLayer?.updateNodes(payload.nodes);
      this.latestNodes = payload.nodes;
      syncYieldLabels(this.labelSystem, payload.nodes);
      handleGameTick(this, payload);
    });
    this.socket.on(EVENTS.COMBAT_EVENT, (payload: { pairs: { aId: string; bId: string }[] }) => {
      for (const pair of payload.pairs) {
        flashUnit(this, pair.aId);
        flashUnit(this, pair.bId);
      }
    });
    this.socket.on(EVENTS.S_UNIT_DEATH, (payload: { unitId: string }) => {
      const sprite = this.unitSprites.get(payload.unitId);
      if (sprite) {
        sprite.parent?.removeChild(sprite);
        sprite.destroy();
        this.unitSprites.delete(payload.unitId);
      }
    });

    this.app.ticker.add(() => {
      handleTick(this);
      this.updateTextScaling();
      animateLabels(this.labelSystem);

      if (this.frames % 10 === 0 && this.metricsCb) {
        this.metricsCb({
          fps: Math.round(this.app.ticker.FPS),
          zoom: Math.round(this.viewport.scale.x * 100) / 100,
          unitCount: this.unitSprites.size,
          selectedUnit: this.selectedUnitId,
        });
      }
    });
    setupInteraction({
      viewport: this.viewport,
      provincesLayer: this.provincesLayer,
      unitSprites: this.unitSprites,
      edges: this.edges,
      nodesById: this.nodesById,
      socket: this.socket as unknown as Socket,
      myPlayerId: useGameStore.getState().myPlayerId,
      selectUnit: (id: string | null) => this.selectUnit(id),
      setSelectedProvinceId: (id: string | null) => this.setSelectedProvinceId(id),
      mapEngine: this,
    });
  }
  incrementFrames(): void { this.frames++; }
  getFrames(): number { return this.frames; }
  getLastSample(): number { return this.lastSample; }
  setLastSample(time: number): void { this.lastSample = time; }
  notifyMetrics(_data: EngineMetrics): void {}

  public selectUnit(unitId: string | null) {
    this.clearSelectionRing();
    this.selectedUnitId = unitId;
    this.selectedProvinceId = null;
    this.provincesLayer?.highlight(null);
    useGameStore.setState({ selectedUnitId: unitId });
    
    if (unitId) {
      const sprite = this.unitSprites.get(unitId);
      if (sprite) {
        const ring = new Graphics();
        ring.lineStyle(2, 0x00ff00, 0.8);
        ring.drawCircle(0, 0, 12);
        sprite.addChild(ring);
        this.selectionRing = ring;
      }
    }
    if (this.onSelectionChange) this.onSelectionChange(unitId);
  }

  public enterTargetingMode() { if (!this.selectedUnitId) return; this.setInteractionMode('TARGETING'); }

  private setInteractionMode(mode: InteractionMode) {
    this.interactionMode = mode;
    const canvas = this.app.view as HTMLCanvasElement;
    canvas.style.cursor = mode === 'TARGETING' ? 'crosshair' : 'default';
    useGameStore.setState({ interactionMode: mode });
  }

  public updateCursorForMode(mode: InteractionMode) {
    this.interactionMode = mode;
    (this.app.view as HTMLCanvasElement).style.cursor = mode === 'TARGETING' ? 'crosshair' : 'default';
  }

  public setSelectedProvinceId(id: string | null) { this.selectedProvinceId = id; useGameStore.setState({ selectedNodeId: id }); }

  private clearSelectionRing() {
    if (this.selectionRing?.parent) {
      this.selectionRing.parent.removeChild(this.selectionRing);
      this.selectionRing.destroy();
      this.selectionRing = null;
    }
  }

  private updateTextScaling() {
    const zoom = Math.max(this.viewport.scale.x, 0.2);
    const labelScale = 0.33 / zoom;
    const unitOffset = 25 + 12 / zoom; // world clearance + screen padding
    updateLabelTargets(this.labelSystem, this.latestNodes, this.unitSprites, zoom, unitOffset);
    for (const label of this.labelSystem.labels.values()) label.scale.set(labelScale);

    const unitScale = 0.33 / zoom;
    for (const sprite of this.unitSprites.values()) {
      if (sprite.countLabel) {
        sprite.countLabel.scale.set(unitScale);
        sprite.countLabel.position.set(0, -unitOffset);
      }
    }
  }

  public destroy() {
    this.socket.disconnect();
    const view = this.app.view as HTMLCanvasElement;
    if (view?.parentNode) view.parentNode.removeChild(view);
    destroyLabelSystem(this.labelSystem);
    this.app.destroy(true, { children: true });
  }
}

