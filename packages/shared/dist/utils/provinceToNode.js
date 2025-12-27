"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureProvinceNodeId = ensureProvinceNodeId;
const world_graph_json_1 = __importDefault(require("../data/world-graph.json"));
// Local default graph to avoid index import cycles
const defaultGraph = world_graph_json_1.default;
const nodeIdSet = new Set(defaultGraph.nodes.map((n) => n.id));
/**
 * Resolve a province id to a valid road node id, or null if unmapped.
 */
function ensureProvinceNodeId(provinceId, graph = defaultGraph) {
    if (!provinceId)
        return null;
    const fromDefault = nodeIdSet.has(provinceId) ? provinceId : null;
    if (fromDefault)
        return fromDefault;
    const existsInGraph = graph.nodes.some((n) => n.id === provinceId);
    return existsInGraph ? provinceId : null;
}
