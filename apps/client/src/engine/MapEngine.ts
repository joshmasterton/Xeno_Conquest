import { Application, Graphics, Sprite, Renderer } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { io, Socket } from 'socket.io-client';
import {
  worldGraph,
  WORLD_SIZE,
  EVENTS,
  provinces,
  ensureProvinceNodeId,
  type RoadEdge,
  type RoadNode,
  type Territory,
  type ServerToClientEvents,
  type ClientToServerEvents,
  type ServerGameTick,
  type MovementSegment,
} from '@xeno/shared';
import type { EventSystem } from '@pixi/events';
import { ProvincesLayer } from './ProvincesLayer';
import { findNearestEdge } from './edgeHitTest';

type RendererWithEvents = Renderer & { events: EventSystem };

export interface EngineMetrics {
  fps: number;
  zoom: number;
  unitCount: number;
  selectedUnit: string | null;
}

export class MapEngine {
  private app: Application;
  private viewport: Viewport;
  private socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  private unitSprites: Map<string, Graphics> = new Map();
  private activeSegments: Map<string, MovementSegment> = new Map();
  private flashTimers: Map<string, number> = new Map();
  private flashHalos: Map<string, Graphics> = new Map();
  private railsLayer: Graphics;
  private provincesLayer: ProvincesLayer | null = null;
  private metricsCb?: (m: EngineMetrics) => void;
  private frames = 0;
  private lastSample = performance.now();
  private edges: RoadEdge[] = worldGraph.edges;
  private nodesById: Map<string, RoadNode> = new Map(worldGraph.nodes.map(n => [n.id, n]));
  private selectedUnitId: string | null = null;
  private selectedProvinceId: string | null = null;
  private nodeGraphics: Map<string, Graphics> = new Map();
  private targetMarker: Graphics | null = null;
  private selectionRing: Graphics | null = null; // Visual indicator for selected unit

  constructor(container: HTMLElement, opts?: { onMetrics?: (m: EngineMetrics) => void }) {
    this.metricsCb = opts?.onMetrics;

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
    this.provincesLayer.setProvinces(provinces as Territory[]);

    // Use viewport's click detection (ignores drags)
    // Cast to any so TS accepts pixi-viewport's custom 'clicked' event
    (this.viewport as any).on('clicked', (e: any) => {
      const { x, y } = e.world;
      const currentZoom = this.viewport.scale.x || 1;

      // MODE A: Unit selected → issue orders, ignore province selection UI
      if (this.selectedUnitId) {
        // 1) Try precise road/edge click first
        const edgeHit = findNearestEdge(this.edges, this.nodesById, x, y, 20 / currentZoom);
        if (edgeHit) {
          console.log(`🛣 Move to Edge: ${edgeHit.edge.id} @ ${Math.round(edgeHit.t * 100)}%`);
          this.socket.emit(EVENTS.C_MOVE_ORDER, {
            unitId: this.selectedUnitId,
            targetEdgeId: edgeHit.edge.id,
            targetPercent: edgeHit.t,
          });

          // Draw a temporary target marker at the clicked stop location
          const start = this.nodesById.get(edgeHit.edge.sourceNodeId);
          const end = this.nodesById.get(edgeHit.edge.targetNodeId);
          if (start && end) {
            const mx = start.x + (end.x - start.x) * edgeHit.t;
            const my = start.y + (end.y - start.y) * edgeHit.t;

            if (this.targetMarker) {
              if (this.targetMarker.parent) this.targetMarker.parent.removeChild(this.targetMarker);
              this.targetMarker.destroy();
              this.targetMarker = null;
            }
            const marker = new Graphics();
            marker.lineStyle(2, 0x00ff00, 0.95);
            marker.drawCircle(mx, my, 10);
            marker.moveTo(mx - 6, my);
            marker.lineTo(mx + 6, my);
            marker.moveTo(mx, my - 6);
            marker.lineTo(mx, my + 6);
            marker.alpha = 0.9;
            this.viewport.addChild(marker);
            this.targetMarker = marker;
            window.setTimeout(() => {
              if (this.targetMarker) {
                if (this.targetMarker.parent) this.targetMarker.parent.removeChild(this.targetMarker);
                this.targetMarker.destroy();
                this.targetMarker = null;
              }
            }, 2000);
          }

          // Order sent → deselect unit immediately
          this.clearUnitSelection();
          return;
        }

        // 2) Else try province center (node) move
        const province = this.provincesLayer?.hitTest(x, y);
        if (province) {
          const nodeId = ensureProvinceNodeId(province.id, worldGraph);
          if (nodeId) {
            console.log(`🏳 Move to Province: ${province.id}`);
            this.socket.emit(EVENTS.C_MOVE_ORDER, {
              unitId: this.selectedUnitId,
              destNodeId: nodeId,
            });
          }
          this.clearUnitSelection(); // Order or attempt handled → deselect unit
          return;
        }

        // 3) Empty click → deselect unit
        this.clearUnitSelection();
        return;
      }

      // MODE B: No unit selected → normal province selection
      const hitProvince = this.provincesLayer?.hitTest(x, y);
      if (hitProvince) {
        if (this.selectedProvinceId === hitProvince.id) {
          this.selectedProvinceId = null;
          this.provincesLayer?.highlight(null);
        } else {
          this.selectedProvinceId = hitProvince.id;
          this.provincesLayer?.highlight(hitProvince);
        }
      } else {
        this.selectedProvinceId = null;
        this.provincesLayer?.highlight(null);
      }
    });

    // Render interactive node dots
    const nodesLayer = new Graphics();
    for (const node of worldGraph.nodes) {
      const dot = new Graphics();
      dot.beginFill(0x4488ff);
      dot.drawCircle(node.x, node.y, 4);
      dot.endFill();
      dot.interactive = true;
      dot.cursor = 'pointer';
      dot.on('pointerdown', () => this.onNodeClick(node.id));
      this.viewport.addChild(dot);
      this.nodeGraphics.set(node.id, dot);
    }

    this.socket = io('http://localhost:3000') as Socket<ServerToClientEvents, ClientToServerEvents>;
    this.socket.on('connect', () => console.log('✅ Connected to Game Server'));
    this.socket.on('disconnect', () => console.log('❌ Disconnected from Game Server'));
    this.socket.on('connect_error', (err) => console.error('⚠ Connection error:', err));
    this.socket.on(EVENTS.S_GAME_TICK, (payload: ServerGameTick) => this.onGameTick(payload));
    this.socket.on(EVENTS.COMBAT_EVENT, (payload) => this.onCombatEvent(payload));

    this.app.ticker.add(this.onTick);
  }

  private onTick = () => {
    this.frames++;
    const now = performance.now();
    if (now - this.lastSample >= 1000) {
      const zoom = Number(this.viewport.scale.x.toFixed(2));
      this.metricsCb?.({ fps: this.frames, zoom, unitCount: this.unitSprites.size, selectedUnit: this.selectedUnitId });
      this.frames = 0;
      this.lastSample = now;
    }

    // Interpolate unit positions from active segments
    const tNow = Date.now();
    for (const [unitId, seg] of this.activeSegments) {
      const sprite = this.unitSprites.get(unitId);
      if (!sprite) continue;
      if (seg.durationMs === 0) {
        // Idle snapshot: snap and hold
        sprite.position.set(seg.start.x, seg.start.y);
        continue;
      }
      const elapsed = tNow - seg.startTime;
      const t = Math.min(1, Math.max(0, elapsed / seg.durationMs));
      const x = seg.start.x + (seg.end.x - seg.start.x) * t;
      const y = seg.start.y + (seg.end.y - seg.start.y) * t;
      sprite.position.set(x, y);
    }

    // LOD scaffolding: show provinces during gameplay, hide unit dots at macro zoom
    const currentZoom = this.viewport.scale.x;
    const macro = currentZoom < 0.2;
    for (const sprite of this.unitSprites.values()) {
      sprite.visible = !macro;
    }
    if (this.railsLayer) {
      this.railsLayer.alpha = macro ? 0.15 : 0.3;
    }
    if (this.provincesLayer) {
      // Always show province borders
      this.provincesLayer.setVisible(true);
    }
  };

  private onGameTick = (data: ServerGameTick) => {
    // Ensure sprites exist for all units
    for (const serverUnit of data.units) {
      if (!this.unitSprites.has(serverUnit.id)) {
        const g = new Graphics();
        // Color: orange for player units, red for AI
        const isPlayerUnit = serverUnit.ownerId && serverUnit.ownerId.startsWith('player');
        const color = isPlayerUnit ? 0xffaa00 : 0xff0000;
        g.beginFill(color);
        g.drawCircle(0, 0, 8);
        g.endFill();
        g.interactive = true;
        g.cursor = 'pointer';
        g.on('pointerdown', () => {
          this.selectUnit(serverUnit.id);
        });
        this.viewport.addChild(g);
        this.unitSprites.set(serverUnit.id, g);
      }
    }
    // Update segments (replace per tick)
    this.activeSegments.clear();
    for (const seg of data.segments) {
      this.activeSegments.set(seg.unitId, seg);
      const sprite = this.unitSprites.get(seg.unitId);
      if (sprite && seg.durationMs === 0) {
        // Immediately snap idle segments
        sprite.position.set(seg.start.x, seg.start.y);
      }
    }
  };

  private onCombatEvent = (payload: { pairs: { aId: string; bId: string }[] }) => {
    for (const pair of payload.pairs) {
      this.flashUnit(pair.aId);
      this.flashUnit(pair.bId);
    }
  };

  private flashUnit(unitId: string) {
    const sprite = this.unitSprites.get(unitId);
    if (!sprite) return;
    // Clear any existing timer
    const existing = this.flashTimers.get(unitId);
    if (existing) {
      clearTimeout(existing);
    }

    // Remove prior halo if present
    const priorHalo = this.flashHalos.get(unitId);
    if (priorHalo && priorHalo.parent) {
      priorHalo.parent.removeChild(priorHalo);
    }

    // Add a yellow halo child that inherits movement
    const halo = new Graphics();
    halo.beginFill(0xffff00, 0.45);
    halo.drawCircle(0, 0, 12);
    halo.endFill();
    halo.alpha = 0.9;
    halo.scale.set(1.2);
    sprite.addChild(halo);
    this.flashHalos.set(unitId, halo);

    const timer = window.setTimeout(() => {
      if (halo.parent) {
        halo.parent.removeChild(halo);
      }
      this.flashHalos.delete(unitId);
      this.flashTimers.delete(unitId);
    }, 200);
    this.flashTimers.set(unitId, timer);
  }

  public destroy() {
    this.socket.disconnect();
    this.app.ticker.remove(this.onTick);
    this.app.destroy(true, { children: true });
  }

  

  private onNodeClick = (nodeId: string) => {
    if (!this.selectedUnitId) {
      console.log('⚠ No unit selected. Click a unit first.');
      return;
    }
    console.log(`🎯 Issuing order: ${this.selectedUnitId} → ${nodeId}`);
    this.socket.emit(EVENTS.C_MOVE_ORDER, { unitId: this.selectedUnitId, destNodeId: nodeId });
    this.clearUnitSelection(); // Deselect after order
  };

  private selectUnit(unitId: string) {
    // Clear any prior selection ring
    this.clearSelectionRing();

    this.selectedUnitId = unitId;
    this.selectedProvinceId = null;
    this.provincesLayer?.highlight(null);

    // Draw selection ring around the unit (bright green circle)
    const sprite = this.unitSprites.get(unitId);
    if (sprite) {
      const ring = new Graphics();
      ring.lineStyle(2, 0x00ff00, 1.0);
      ring.drawCircle(0, 0, 16);
      ring.alpha = 0.95;
      sprite.addChild(ring);
      this.selectionRing = ring;
    }

    console.log(`Selected Unit: ${unitId}`);
    // Update UI immediately
    this.updateMetrics();
  }

  private clearUnitSelection() {
    this.clearSelectionRing();
    this.selectedUnitId = null;
    console.log('Unit Deselected');
    // Update UI immediately
    this.updateMetrics();
  }

  private clearSelectionRing() {
    if (this.selectionRing && this.selectionRing.parent) {
      this.selectionRing.parent.removeChild(this.selectionRing);
      this.selectionRing.destroy();
      this.selectionRing = null;
    }
  }

  private updateMetrics() {
    const zoom = Number(this.viewport.scale.x.toFixed(2));
    this.metricsCb?.({
      fps: this.frames,
      zoom,
      unitCount: this.unitSprites.size,
      selectedUnit: this.selectedUnitId,
    });
  }
}
