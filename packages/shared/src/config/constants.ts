export const TICK_RATE = 100; // ms per server tick
export const WORLD_SIZE = 4096; // world width/height in pixels (matches assets)
export const COMBAT_RADIUS = 50; // pixels; proximity threshold for combat trigger
export const UNIT_BASE_SPEED = 60; // pixels per second for standard units
export const COMBAT_DPS = 5; // damage per second
export const CAPTURE_TIME_SEC = 0; // instant capture for now

// Designated base nodes (spawn points) by node id
// These should correspond to nodes present in world-graph.json
export const BASE_NODE_IDS = [
	'#ccd417', // Player base (South-West, safe zone)
	'#eda400', // AI 1 (North-West)
	'#716388', // AI 2
	'#2721d2', // AI 3
	'#a28f55', // AI 4
];
