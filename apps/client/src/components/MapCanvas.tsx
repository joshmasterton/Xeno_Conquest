import { useEffect, useRef } from "react";
import { MapEngine } from "../pixi/MapEngine";
import { Territory, Point } from "@xeno/shared";

type Props = {
  territories: Territory[];
  onEngineReady?: (engine: MapEngine) => void;
};

export function MapCanvas({ territories, onEngineReady }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MapEngine | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    engineRef.current = new MapEngine(containerRef.current);
    onEngineReady?.(engineRef.current);
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [onEngineReady]);

  useEffect(() => {
    engineRef.current?.setTerritories(territories);
  }, [territories]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100vh",
        background: "#05070f",
      }}
    />
  );
}
