"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BASE_NODE_IDS = exports.CAPTURE_TIME_SEC = exports.COMBAT_DPS = exports.UNIT_BASE_SPEED = exports.COMBAT_RADIUS = exports.WORLD_SIZE = exports.TICK_RATE = void 0;
exports.TICK_RATE = 100; // ms per server tick
exports.WORLD_SIZE = 4096; // world width/height in pixels (matches assets)
exports.COMBAT_RADIUS = 50; // pixels; proximity threshold for combat trigger
exports.UNIT_BASE_SPEED = 60; // pixels per second for standard units
exports.COMBAT_DPS = 5; // damage per second
exports.CAPTURE_TIME_SEC = 0; // instant capture for now
// Designated base nodes (spawn points) by node id
// These should correspond to nodes present in world-graph.json
exports.BASE_NODE_IDS = [
    '#000000',
    '#eda400',
    '#716388',
    '#2721d2',
    '#a28f55',
];
