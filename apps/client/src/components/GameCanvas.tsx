import React, { useEffect, useRef, useState } from 'react';
import { MapEngine, type EngineMetrics } from '../engine/MapEngine';

export const GameCanvas = () => {
  const divRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const [metrics, setMetrics] = useState<EngineMetrics | null>(null);
  
  // ✅ NEW: UI State
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [isTargeting, setIsTargeting] = useState(false);

  useEffect(() => {
    if (!divRef.current) return;

    // Initialize Engine
    const engine = new MapEngine(divRef.current, {
      onMetrics: (m) => setMetrics(m),
      // ✅ Connect Engine Selection to React State
      onSelectionChange: (unitId) => {
        setSelectedUnit(unitId);
        setIsTargeting(false); // Reset targeting when selection changes
      }
    });
    
    engineRef.current = engine;

    return () => {
      engine.destroy();
    };
  }, []);

  // ✅ UI Action: Move Button Clicked
  const handleMoveClick = () => {
    if (engineRef.current) {
      engineRef.current.enterTargetingMode();
      setIsTargeting(true);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      
      {/* 1. The Map */}
      <div ref={divRef} style={{ width: '100%', height: '100%' }} />

      {/* 2. Debug Overlay (Top Left) */}
      <div style={{
        position: 'absolute', top: 10, left: 10,
        background: 'rgba(0,0,0,0.7)', color: 'white', padding: '10px',
        pointerEvents: 'none', userSelect: 'none'
      }}>
        <div>FPS: {metrics?.fps}</div>
        <div>Zoom: {metrics?.zoom}</div>
        <div>Units: {metrics?.unitCount}</div>
      </div>

      {/* 3. ✅ COMMAND BAR (Bottom Right) */}
      {selectedUnit && (
        <div style={{
          position: 'absolute', bottom: 20, right: 20,
          background: 'rgba(30,30,30,0.9)', padding: '15px',
          border: '2px solid #555', borderRadius: '8px',
          display: 'flex', flexDirection: 'column', gap: '10px'
        }}>
          <div style={{ color: '#fff', fontWeight: 'bold' }}>
            Unit Selected: {selectedUnit.substring(0, 8)}...
          </div>

          {!isTargeting && selectedUnit.startsWith('player') ? (
            <button 
              onClick={handleMoveClick}
              style={{
                background: '#ffaa00', color: 'black', fontWeight: 'bold',
                padding: '10px 20px', border: 'none', borderRadius: '4px',
                cursor: 'pointer', fontSize: '16px'
              }}
            >
              MOVE UNIT
            </button>
          ) : (
            <div style={{ 
              color: '#00ff00', fontWeight: 'bold', fontSize: '16px',
              animation: 'pulse 1s infinite'
            }}>
              🎯 SELECT TARGET...
            </div>
          )}
          {selectedUnit.startsWith('unit-') && (
            <div style={{ color: '#aaa', fontSize: '12px', marginTop: '8px' }}>
              (Enemy unit - no controls)
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};
