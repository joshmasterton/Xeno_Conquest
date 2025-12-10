import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Territory, Point } from "@xeno/shared/types";
import { MapCanvas } from "./components/MapCanvas";
import { createSocket } from "./lib/socket";
import { MapEngine } from "./pixi/MapEngine";
import { useUnitStore } from "./store/units";
import staticMapData from "./assets/staticMap.json";

// Load static map (bundled at build time, not received from server)
function loadStaticMap(): Territory[] {
  return staticMapData.territories as Territory[];
  const worldSize = 2000;
  const minDistance = 200;
  const territories: Territory[] = [];
  const points: { x: number; y: number }[] = [];
  
  // Generate elevation map (simplex-like noise approximation)
  const elevation = (x: number, y: number) => {
    const scale1 = 0.003;
    const scale2 = 0.01;
    const e1 = Math.sin(x * scale1) * Math.cos(y * scale1) * 0.5;
    const e2 = Math.sin(x * scale2 + 3) * Math.cos(y * scale2 + 7) * 0.3;
    return e1 + e2; // Range: -0.8 to 0.8
  };
  
  // Generate ~20 points using rejection sampling
  const maxAttempts = 1000;
  let attempts = 0;
  
  while (points.length < 20 && attempts < maxAttempts) {
    attempts++;
    const x = Math.random() * worldSize;
    const y = Math.random() * worldSize;
    
    const tooClose = points.some(p => {
      const dx = p.x - x;
      const dy = p.y - y;
      return Math.sqrt(dx * dx + dy * dy) < minDistance;
    });
    
    if (!tooClose) {
      points.push({ x, y });
    }
  }
  
  // Terrain type names based on elevation
  const highlandNames = ['Frost Peaks', 'Titan Ridge', 'Crystal Summit', 'Iron Heights', 'Storm Pinnacle'];
  const plainNames = ['Crimson Steppe', 'Azure Fields', 'Echo Valley', 'Nova Flats', 'Jade Expanse', 'Gamma Wastes', 'Sigma Grove'];
  const lowlandNames = ['Alpha Basin', 'Hydra Depths', 'Delta Marsh', 'Kilo Lagoon', 'Rift Chasm'];
  const craterNames = ['Ion Crater', 'Magma Core', 'Prism Crater', 'Omega Abyss'];
  
  const allNames = [...highlandNames, ...plainNames, ...lowlandNames, ...craterNames];
  
  points.forEach((centroid, i) => {
    const e = elevation(centroid.x, centroid.y);
    
    // Determine terrain type from elevation
    let terrainType: 'highland' | 'plain' | 'lowland' | 'crater';
    if (e > 0.4) terrainType = 'highland';
    else if (e > 0) terrainType = 'plain';
    else if (e > -0.4) terrainType = 'lowland';
    else terrainType = 'crater';
    
    // Size and shape variation based on terrain
    const baseRadius = terrainType === 'crater' ? 100 : 
                      terrainType === 'highland' ? 90 : 
                      terrainType === 'lowland' ? 110 : 95;
    const radius = baseRadius + Math.random() * 30;
    
    // More sides for organic shapes
    const sides = 7 + Math.floor(Math.random() * 3);
    const polygon: { x: number; y: number }[] = [];
    
    for (let j = 0; j < sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      // Add perlin-like variance for organic edges
      const angleNoise = Math.sin(angle * 3 + i) * 0.15;
      const radiusVariance = 0.7 + Math.random() * 0.5 + angleNoise;
      polygon.push({
        x: centroid.x + Math.cos(angle) * radius * radiusVariance,
        y: centroid.y + Math.sin(angle) * radius * radiusVariance
      });
    }
    
    // Assign ownership: first 2 to players, rest neutral
    let ownerId: string | undefined;
    if (i === 0) ownerId = 'player-1';
    else if (i === 1) ownerId = 'player-2';
    
    territories.push({
      id: `t-${i + 1}`,
      name: allNames[i] || `Territory ${i + 1}`,
      centroid,
      polygon,
      ownerId,
      terrainType,
      elevation: e
    });
  });
  
  return territories;
}

export function App() {
  // Load static map (never received from server, bundled with client)
  const [territories] = useState<Territory[]>(() => loadStaticMap());
  const [territoryOwnership, setTerritoryOwnership] = useState<Record<string, string | undefined>>({});
  const [playerId, setPlayerId] = useState<string | null>(null);
  const socketRef = useRef<ReturnType<typeof createSocket> | null>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null);
  
  const addUnit = useUnitStore((state) => state.addUnit);
  const getUnit = useUnitStore((state) => state.getUnit);
  
  // Spawn initial units for current player
  useEffect(() => {
    const timer = setTimeout(() => {
      if (engineRef.current && territories.length > 0 && playerId) {
        // Find player's territory using ownership map
        const playerTerritory = territories.find(t => territoryOwnership[t.id] === playerId);
        
        if (playerTerritory) {
          // Spawn 1-2 units for this player at their territory
          const unitCount = playerId === 'player-1' ? 2 : 1;
          for (let i = 0; i < unitCount; i++) {
            const unitId = `unit-${playerId}-${i + 1}`;
            const pos = i === 0 
              ? playerTerritory.centroid 
              : { x: playerTerritory.centroid.x + (i * 20), y: playerTerritory.centroid.y + (i * 20) };
            
            addUnit(unitId, pos, playerId);
            engineRef.current.upsertUnit(unitId, pos, playerId);
            console.log('[Client] Spawned unit:', unitId, 'for player:', playerId);
            
            // Broadcast to other players
            socketRef.current?.emit('unit_spawned', { unitId, position: pos, ownerId: playerId });
          }
          
          // Update unit counts on territories
          engineRef.current.updateUnitCounts();
        }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [addUnit, territories, playerId]);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    socket.on("welcome", (data) => {
      console.log("[Client] Welcome:", data);
    });
    
    // Receive game state (ownership + units), not map geometry
    socket.on("game_state", (data: { territories: Array<{ id: string; ownerId?: string }>; units: any[] }) => {
      console.log("[Client] Received game state for", data.territories.length, "territories");
      const ownership: Record<string, string | undefined> = {};
      data.territories.forEach(t => {
        ownership[t.id] = t.ownerId;
      });
      setTerritoryOwnership(ownership);
    });
    
    socket.on("player_assigned", (data: { playerId: string }) => {
      console.log("[Client] Assigned as player:", data.playerId);
      setPlayerId(data.playerId);
    });
    
    socket.on("unit_spawned", (data: { unitId: string; position: Point; ownerId: string }) => {
      console.log("[Client] Other player's unit spawned:", data.unitId);
      // Render other player's units
      if (engineRef.current) {
        addUnit(data.unitId, data.position, data.ownerId);
        engineRef.current.upsertUnit(data.unitId, data.position, data.ownerId);
        engineRef.current.updateUnitCounts();
      }
    });

    socket.on("unit_moving", (intent) => {
      console.log("[Client] unit_moving received:", intent);
      // Add movement intent for interpolation (don't replace existing ones)
      if (engineRef.current) {
        engineRef.current.addMovement(intent);
      }
    });

    socket.on("connect_error", (err) => {
      console.error("socket connect error", err);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const handleMapClick = (worldPos: { x: number; y: number }) => {
    if (!socketRef.current || !selectedUnit) {
      // Auto-select first player unit if none selected
      const unitId = 'unit-player-1';
      setSelectedUnit(unitId);
      console.log('[Client] Selected unit:', unitId);
      return;
    }
    
    const unit = getUnit(selectedUnit);
    if (!unit) {
      console.warn('[Client] Selected unit not found:', selectedUnit);
      return;
    }
    
    console.log(`[Client] Moving ${selectedUnit} from`, unit.position, 'to', worldPos);
    socketRef.current.emit('move_unit', { 
      unitId: selectedUnit, 
      from: unit.position, 
      to: worldPos, 
      speed: 80 
    });
  };
  
  useEffect(() => {
    // Wire up clicks after engine is ready
    if (engineRef.current) {
      engineRef.current.onMapClick(handleMapClick);
      engineRef.current.onUnitClick((unitId) => {
        console.log('[Client] Unit clicked:', unitId);
        setSelectedUnit(unitId);
        engineRef.current?.highlightUnit(unitId);
      });
      engineRef.current.onTerritoryClick((territoryId) => {
        const territory = territories.find(t => t.id === territoryId);
        console.log('[Client] Territory clicked:', territory?.name);
        setSelectedTerritory(territory || null);
      });
    }
  }, [territories]);
  
  // Update highlight when selection changes
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.highlightUnit(selectedUnit);
    }
  }, [selectedUnit]);

  const handleEngineReady = useCallback((engine: MapEngine) => {
    engineRef.current = engine;
  }, []);

  return (
    <div style={{ width: "100%", height: "100vh", fontFamily: "sans-serif" }}>
      <MapCanvas
        territories={territories}
        onEngineReady={handleEngineReady}
      />
      <div
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          padding: "8px 12px",
          background: "rgba(0,0,0,0.6)",
          color: "#c7d2ff",
          borderRadius: 8,
        }}
      >
        <strong>Xeno-Conquest</strong>
        <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
          Click unit → Click territory to move
        </div>
        {selectedUnit && (
          <div style={{ fontSize: 10, marginTop: 4, color: '#4a90e2' }}>
            Unit: {selectedUnit}
          </div>
        )}
        {selectedTerritory && (
          <div style={{ fontSize: 10, marginTop: 4, color: '#ffaa00', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 4 }}>
            <strong>{selectedTerritory.name}</strong>
            <div style={{ opacity: 0.8 }}>
              Owner: {selectedTerritory.ownerId || 'Neutral'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
