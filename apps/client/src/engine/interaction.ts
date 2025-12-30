import { Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { Socket } from 'socket.io-client';
import { EVENTS, worldGraph, ensureProvinceNodeId, type RoadEdge, type RoadNode } from '@xeno/shared';
import { ProvincesLayer } from './ProvincesLayer';
import { findNearestEdge } from './edgeHitTest';
import { useGameStore } from '../store/gameStore';
import type { MapEngine } from './MapEngine';

export interface InteractionHost {
  viewport: Viewport;
  provincesLayer: ProvincesLayer | null;
  unitSprites: Map<string, Graphics>;
  edges: RoadEdge[];
  nodesById: Map<string, RoadNode>;
  socket: Socket;
  myPlayerId: string;
  selectUnit: (id: string | null) => void;
  setSelectedProvinceId: (id: string | null) => void;
  mapEngine: MapEngine;
}

export function setupInteraction(host: InteractionHost) {
  (host.viewport as any).on('clicked', (e: any) => {
    const { x, y } = e.world;

    try {
      // 1. Get State from Store
      const store = useGameStore.getState();
      const { 
        interactionMode, 
        setInteractionMode, 
        selectedUnitId, 
        moveSplitPercent,
        setSelectedUnitId,
        setSelectedNodeId
      } = store;

      // Safety check: if function is missing, warn and return
      if (!setInteractionMode) {
          console.error("CRITICAL: setInteractionMode is missing from gameStore implementation!");
          return;
      }

      // ----------------------------------------------------
      // TARGETING MODE (Move / Attack)
      // ----------------------------------------------------
      if (interactionMode === 'TARGETING' && selectedUnitId) {
        let orderSent = false;
        const currentZoom = host.viewport.scale.x || 1;
        
        // A. Check Edge (Road) Target
        const hitEdge = findNearestEdge(host.edges, host.nodesById, x, y, 40 / currentZoom);

        // Calculate Split
        const sprite = host.unitSprites.get(selectedUnitId) as any;
        const currentCount = sprite?.serverUnit?.count ?? 1;
        let splitCount: number | undefined = undefined;
        
        if (moveSplitPercent < 1.0) {
          splitCount = Math.floor(currentCount * moveSplitPercent);
          if (splitCount < 1) splitCount = 1;
        }

        // Send Order: Move to Edge
        if (hitEdge) {
          console.log('🎯 Order: Edge Target', hitEdge.edge.id);
          host.socket.emit(EVENTS.C_MOVE_ORDER, {
            unitId: selectedUnitId,
            targetEdgeId: hitEdge.edge.id,
            targetPercent: hitEdge.t,
            splitCount,
          });
          orderSent = true;
        }
        
        // Send Order: Move to Node (Province)
        if (!orderSent) {
          const hitProvince = host.provincesLayer?.hitTest(x, y);
          if (hitProvince) {
            const nodeId = ensureProvinceNodeId(hitProvince.id, worldGraph);
            if (nodeId) {
              console.log('🎯 Order: Node Target', nodeId);
              host.socket.emit(EVENTS.C_MOVE_ORDER, {
                unitId: selectedUnitId,
                destNodeId: nodeId,
                splitCount,
              });
              orderSent = true;
            }
          }
        }

        // ✅ SUCCESS: Reset Mode to SELECT
        setInteractionMode('SELECT');
        host.mapEngine.updateCursorForMode('SELECT');
        
        // Deselect unit after successful move to close the menu
        if (orderSent) {
          setSelectedUnitId(null);
        }
        
        // Exit early - don't process any other interactions in targeting mode
        return;
      }

      // If we're in TARGETING mode but no unit selected, just reset mode
      if (interactionMode === 'TARGETING') {
        setInteractionMode('SELECT');
        host.mapEngine.updateCursorForMode('SELECT');
        return;
      }

      // ----------------------------------------------------
      // SELECT MODE (Standard)
      // ----------------------------------------------------
      const currentZoom = host.viewport.scale.x || 1;
      
      // A. Check Unit Hit (Top Layer)
      let clickedUnitId: string | null = null;
      const radius = 20 / currentZoom;
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
        const sprite = host.unitSprites.get(clickedUnitId) as any;
        // Only select my own units
        if (sprite?.unitOwnerId === host.myPlayerId) {
          setSelectedUnitId(clickedUnitId);
          setSelectedNodeId(null); // Deselect province
          host.provincesLayer?.highlight(null);
          return;
        }
      }

      // B. Check Province Hit (Bottom Layer)
      const hit = host.provincesLayer?.hitTest(x, y);
      if (hit) {
        const currentSelectedProvince = store.selectedNodeId;
        if (currentSelectedProvince === hit.id) {
          // Toggle off
          setSelectedNodeId(null);
          host.provincesLayer?.highlight(null);
        } else {
          // Select Province
          setSelectedUnitId(null); // Deselect unit
          setSelectedNodeId(hit.id);
          host.provincesLayer?.highlight(hit);
        }
        return;
      }

      // C. Void Click (Deselect All)
      setSelectedUnitId(null);
      setSelectedNodeId(null);
      host.provincesLayer?.highlight(null);

    } catch (err) {
        console.error("Error in Interaction Handler:", err);
        // Force reset if something crashes to prevent getting stuck
        try {
            const store = useGameStore.getState();
            if (store.setInteractionMode) {
                store.setInteractionMode('SELECT');
                host.mapEngine.updateCursorForMode('SELECT');
            }
        } catch (resetErr) {
            console.error("Failed to reset mode after crash:", resetErr);
        }
    }
  });
}
