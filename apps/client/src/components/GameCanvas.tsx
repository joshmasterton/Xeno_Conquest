import React, { useEffect, useRef, useState } from 'react';
import { TICK_RATE } from '@xeno/shared';
import { MapEngine, type EngineMetrics } from '../engine/MapEngine';

export const GameCanvas = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MapEngine | null>(null);
  const [metrics, setMetrics] = useState<EngineMetrics>({ fps: 0, zoom: 1, unitCount: 0, selectedUnit: null });

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new MapEngine(canvasRef.current, { onMetrics: setMetrics });
    engineRef.current = engine;
    return () => engine.destroy();
  }, []);

  return (
    <div ref={canvasRef} style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 8, left: 8, padding: '8px 12px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontFamily: 'monospace', fontSize: 12, borderRadius: 4, lineHeight: 1.6 }}>
        <div>FPS: {metrics.fps}</div>
        <div>Zoom: {metrics.zoom}x</div>
        <div>Units: {metrics.unitCount}</div>
        <div>Tick: {TICK_RATE} ms</div>
      </div>
      <div style={{ position: 'absolute', bottom: 8, left: 8, padding: '12px 16px', background: 'rgba(0,0,0,0.6)', color: '#fff', fontFamily: 'monospace', fontSize: 13, borderRadius: 4, minWidth: 200 }}>
        <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 'bold' }}>Controls</div>
        <div style={{ color: metrics.selectedUnit ? '#ffaa00' : '#999', marginBottom: 6 }}>
          {metrics.selectedUnit ? `✓ Selected: ${metrics.selectedUnit}` : '① Click orange unit to select'}
        </div>
        <div style={{ color: metrics.selectedUnit ? '#88ff88' : '#666' }}>
          {metrics.selectedUnit ? '② Click blue node to move' : '   (Select a unit first)'}
        </div>
      </div>
    </div>
  );
};
