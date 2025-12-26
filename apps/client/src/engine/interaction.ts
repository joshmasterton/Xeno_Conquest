import { Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { Socket } from 'socket.io-client';
import { EVENTS, worldGraph, ensureProvinceNodeId, type RoadEdge, type RoadNode } from '@xeno/shared';
import { ProvincesLayer } from './ProvincesLayer';
import { findNearestEdge } from './edgeHitTest';
import type { InteractionMode } from './MapEngine';

export interface InteractionHost {
  viewport: Viewport;
  provincesLayer: ProvincesLayer | null;
  unitSprites: Map<string, Graphics>;
  edges: RoadEdge[];
  nodesById: Map<string, RoadNode>;
  socket: Socket;
  getInteractionMode: () => InteractionMode;
  getSelectedUnitId: () => string | null;
  getSelectedProvinceId: () => string | null;
  setInteractionMode: (m: InteractionMode) => void;
  selectUnit: (id: string | null) => void;
  setSelectedProvinceId: (id: string | null) => void;
}

export function setupInteraction(host: InteractionHost) {
  (host.viewport as any).on('clicked', (e: any) => {
    const { x, y } = e.world;

    // TARGETING mode: try road then province; exit mode and deselect
    const mode = host.getInteractionMode();
    const selectedUnitId = host.getSelectedUnitId();
    if (mode === 'TARGETING' && selectedUnitId) {
      let orderSent = false;
      const currentZoom = host.viewport.scale.x || 1;
      const hitEdge = findNearestEdge(host.edges, host.nodesById, x, y, 20 / currentZoom);
      if (hitEdge) {
        host.socket.emit(EVENTS.C_MOVE_ORDER, {
          unitId: selectedUnitId,
          targetEdgeId: hitEdge.edge.id,
          targetPercent: hitEdge.t,
        });
        orderSent = true;
      }
      if (!orderSent) {
        const hitProvince = host.provincesLayer?.hitTest(x, y);
        if (hitProvince) {
          const nodeId = ensureProvinceNodeId(hitProvince.id, worldGraph);
          if (nodeId) {
            host.socket.emit(EVENTS.C_MOVE_ORDER, {
              unitId: selectedUnitId,
              destNodeId: nodeId,
            });
            orderSent = true;
          }
        }
      }
      host.setInteractionMode('SELECT');
      host.selectUnit(null);
      return;
    }

    // SELECT mode: province first, then unit, else deselect
    const hit = host.provincesLayer?.hitTest(x, y);
    if (hit) {
      const currentSelectedProvince = host.getSelectedProvinceId();
      if (currentSelectedProvince === hit.id) {
        host.setSelectedProvinceId(null);
        host.provincesLayer?.highlight(null);
      } else {
        host.setSelectedProvinceId(hit.id);
        host.provincesLayer?.highlight(hit);
        host.selectUnit(null);
      }
      return;
    }

    // Unit selection when not over province
    let clickedUnitId: string | null = null;
    const currentZoom = host.viewport.scale.x || 1;
    const radius = 16 / currentZoom;
    const r2 = radius * radius;
    for (const [id, sprite] of host.unitSprites) {
      const dx = sprite.x - x;
      const dy = sprite.y - y;
      if (dx * dx + dy * dy < r2) {
        clickedUnitId = id;
        break;
      }
    }
    if (clickedUnitId) {
      host.selectUnit(clickedUnitId);
      return;
    }

    // Void click → deselect all
    host.selectUnit(null);
    host.setSelectedProvinceId(null);
    host.provincesLayer?.highlight(null);
  });
}
