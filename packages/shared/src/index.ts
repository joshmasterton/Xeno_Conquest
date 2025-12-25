import worldGraphJson from './data/world-graph.json';
import type { WorldGraph } from './types/world';

export const worldGraph = worldGraphJson as WorldGraph;
export * from './types/map';
export * from './types/world';
export * from './config/constants';
export * from './protocol/events';
export * from './utils/provinceToNode';

// Provinces (territories) metadata, if available
import provincesJson from './data/provinces.json';
import type { Territory } from './types/map';
export const provinces = provincesJson as Territory[];
