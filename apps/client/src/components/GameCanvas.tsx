import React, { useEffect, useRef } from 'react';
import { Application, Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { io, Socket } from 'socket.io-client';
import { worldGraph, RoadEdge } from '@xeno/shared';

export const GameCanvas = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const appRef = useRef<Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const unitSpritesRef = useRef<Map<string, Graphics>>(new Map());

  useEffect(() => {
    if (!canvasRef.current) return;

    // 1. Initialize Pixi Application
    const app = new Application({
      resizeTo: window,
      backgroundColor: 0x1a1a1a, // Dark grey background
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    
    canvasRef.current.appendChild(app.view as HTMLCanvasElement);
    appRef.current = app;

    // 2. Initialize Viewport (Camera)
    const viewport = new Viewport({
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      worldWidth: 4000,
      worldHeight: 4000,
    });

    app.stage.addChild(viewport as any);
    viewportRef.current = viewport;

    // Enable Camera Controls
    viewport
      .drag()
      .pinch()
      .wheel()
      .decelerate();

    // 3. Draw the Static Map (The Rails)
    const mapLayer = new Graphics();
    mapLayer.lineStyle(2, 0x444444); // Gray lines
    mapLayer.eventMode = 'none'; // Fix: Disable events on non-interactive graphics

    // Cast edges to correct type
    const edges = worldGraph.edges as unknown as RoadEdge[];
    const nodes = worldGraph.nodes as unknown as any[]; // If you need node lookup

    // Helper to find node coordinates
    const getNode = (id: string) => nodes.find(n => n.id === id);

    edges.forEach(edge => {
      const start = getNode(edge.sourceNodeId);
      const end = getNode(edge.targetNodeId);

      if (start && end) {
        mapLayer.moveTo(start.x, start.y);
        mapLayer.lineTo(end.x, end.y);
      }
    });

    viewport.addChild(mapLayer);

    // 4. Setup Network & Unit Rendering
    const socket = io('http://localhost:3000');
    socketRef.current = socket;

    socket.on('connect', () => console.log('✅ Connected to Game Server'));

    // Listen for the "Pulse"
    socket.on('S_GAME_TICK', (data: { units: any[] }) => {
      const { units } = data;

      units.forEach((serverUnit) => {
        let sprite = unitSpritesRef.current.get(serverUnit.id);

        // Create sprite if it doesn't exist
        if (!sprite) {
          sprite = new Graphics();
          sprite.beginFill(0xff0000); // Red Dot
          sprite.drawCircle(0, 0, 10); // Radius 10
          sprite.eventMode = 'none'; // Fix: Disable events on unit sprites
          sprite.endFill();
          viewport.addChild(sprite);
          unitSpritesRef.current.set(serverUnit.id, sprite);
        }

        // Interpolate Position
        // Server sends: edgeId, distanceOnEdge
        // We calculate real (x, y) based on the map
        const edge = edges.find(e => e.id === serverUnit.edgeId);
        if (edge) {
          const start = getNode(edge.sourceNodeId);
          const end = getNode(edge.targetNodeId);

          if (start && end) {
            const t = Math.min(1, Math.max(0, serverUnit.distanceOnEdge / edge.length));
            
            // Linear Interpolation (Lerp)
            sprite.x = start.x + (end.x - start.x) * t;
            sprite.y = start.y + (end.y - start.y) * t;
          }
        }
      });
    });

    // Cleanup on Unmount
    return () => {
      console.log('Cleaning up GameCanvas...');
      socket.disconnect();
      app.destroy(true, { children: true });
    };
  }, []);

  return <div ref={canvasRef} style={{ width: '100vw', height: '100vh', overflow: 'hidden' }} />;
};
