"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sharp_1 = __importDefault(require("sharp"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ASSETS_DIR = path_1.default.join(__dirname, '../../assets');
const WATER_COLOR = 0x000000;
const MIN_PIXELS = 30; // Lower threshold to keep small river banks
const SIMPLIFICATION_TOLERANCE = 0.5;
function getPixelColor(data, width, height, x, y, channels) {
    if (x < 0 || x >= width || y < 0 || y >= height)
        return -1;
    const idx = (y * width + x) * channels;
    return (data[idx] << 16) | (data[idx + 1] << 8) | data[idx + 2];
}
/**
 * Finds ALL disconnected islands for a set of pixels.
 */
function findIslands(pixels) {
    const islands = [];
    const pixelSet = new Set();
    pixels.forEach(p => pixelSet.add(`${p.x},${p.y}`));
    const visited = new Set();
    for (const p of pixels) {
        const key = `${p.x},${p.y}`;
        if (visited.has(key))
            continue;
        // Flood fill new island
        const island = [];
        const queue = [p];
        visited.add(key);
        while (queue.length > 0) {
            const curr = queue.pop();
            island.push(curr);
            const neighbors = [
                { x: curr.x + 1, y: curr.y }, { x: curr.x - 1, y: curr.y },
                { x: curr.x, y: curr.y + 1 }, { x: curr.x, y: curr.y - 1 }
            ];
            for (const n of neighbors) {
                const nKey = `${n.x},${n.y}`;
                if (pixelSet.has(nKey) && !visited.has(nKey)) {
                    visited.add(nKey);
                    queue.push(n);
                }
            }
        }
        islands.push(island);
    }
    return islands;
}
function traceContour(islandPixels) {
    if (islandPixels.length < 3)
        return [];
    // Find Top-Left pixel of THIS island to start
    let startNode = islandPixels[0];
    for (const p of islandPixels) {
        if (p.y < startNode.y || (p.y === startNode.y && p.x < startNode.x)) {
            startNode = p;
        }
    }
    const contour = [];
    const pixelSet = new Set(islandPixels.map(p => `${p.x},${p.y}`));
    const neighbors = [
        [-1, 0], [-1, -1], [0, -1], [1, -1],
        [1, 0], [1, 1], [0, 1], [-1, 1]
    ];
    let cx = startNode.x;
    let cy = startNode.y;
    let backtrackIdx = 0; // Look Left (0) because we start at Top-Left
    contour.push([cx, cy]);
    let safety = 0;
    const MAX_STEPS = islandPixels.length * 5;
    while (safety++ < MAX_STEPS) {
        let foundNext = false;
        for (let i = 0; i < 8; i++) {
            const idx = (backtrackIdx + i) % 8;
            const nx = cx + neighbors[idx][0];
            const ny = cy + neighbors[idx][1];
            if (pixelSet.has(`${nx},${ny}`)) {
                cx = nx;
                cy = ny;
                contour.push([cx, cy]);
                backtrackIdx = (idx + 4 + 2) % 8;
                foundNext = true;
                break;
            }
        }
        if (!foundNext)
            break;
        if (cx === startNode.x && cy === startNode.y && contour.length > 2)
            break;
    }
    return contour;
}
function simplifyContour(points, tolerance) {
    if (points.length <= 2)
        return points;
    let maxDist = 0;
    let maxIdx = 0;
    const start = points[0];
    const end = points[points.length - 1];
    for (let i = 1; i < points.length - 1; i++) {
        const d = pointToLineDistance(points[i], start, end);
        if (d > maxDist) {
            maxDist = d;
            maxIdx = i;
        }
    }
    if (maxDist > tolerance) {
        const left = simplifyContour(points.slice(0, maxIdx + 1), tolerance);
        const right = simplifyContour(points.slice(maxIdx), tolerance);
        return left.slice(0, -1).concat(right);
    }
    return [start, end];
}
function pointToLineDistance(p, a, b) {
    const num = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1]));
    const den = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
    return den === 0 ? 0 : num / den;
}
// --- MAIN ---
async function processMap() {
    console.log('Loading provinces.png...');
    const buffer = await (0, sharp_1.default)(path_1.default.join(ASSETS_DIR, 'provinces.png'))
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { data, info } = buffer;
    const { width, height, channels } = info;
    // 1. Group Pixels
    const colorMap = new Map();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const colorId = getPixelColor(data, width, height, x, y, channels);
            if (colorId === WATER_COLOR || colorId === -1)
                continue;
            if (!colorMap.has(colorId)) {
                colorMap.set(colorId, {
                    colorId,
                    hex: `#${colorId.toString(16).padStart(6, '0')}`,
                    pixels: [],
                    centroidX: 0, centroidY: 0
                });
            }
            colorMap.get(colorId).pixels.push({ x, y });
        }
    }
    // 2. Process Regions
    const territories = [];
    const nodes = [];
    const validColorIds = new Set();
    console.log(`Processing ${colorMap.size} regions...`);
    for (const [colorId, region] of colorMap) {
        if (region.pixels.length < MIN_PIXELS)
            continue;
        // A. Find ALL Islands
        const islands = findIslands(region.pixels);
        // B. Trace ALL Valid Islands
        const validContours = [];
        let largestIsland = [];
        for (const island of islands) {
            if (island.length < MIN_PIXELS)
                continue; // Skip mostly noise
            if (island.length > largestIsland.length)
                largestIsland = island;
            let raw = traceContour(island);
            // Handle closed loops for RDP: remove duplicate last point if same as first
            let isClosed = false;
            if (raw.length > 1 && raw[0][0] === raw[raw.length - 1][0] && raw[0][1] === raw[raw.length - 1][1]) {
                isClosed = true;
                raw = raw.slice(0, -1);
            }
            let simple = simplifyContour(raw, SIMPLIFICATION_TOLERANCE);
            if (isClosed && simple.length > 0) {
                simple = [...simple, simple[0]];
            }
            if (simple.length >= 3)
                validContours.push(simple);
        }
        if (validContours.length === 0)
            continue;
        // C. Centroid (Based on Largest Island Only - for Game Node Position)
        const sumX = largestIsland.reduce((acc, p) => acc + p.x, 0);
        const sumY = largestIsland.reduce((acc, p) => acc + p.y, 0);
        region.centroidX = Math.round(sumX / largestIsland.length);
        region.centroidY = Math.round(sumY / largestIsland.length);
        validColorIds.add(colorId);
        nodes.push({ id: region.hex, x: region.centroidX, y: region.centroidY, ownerId: null });
        territories.push({
            id: region.hex,
            x: region.centroidX,
            y: region.centroidY,
            pixelCount: region.pixels.length,
            neighbors: [],
            radius: Math.sqrt(largestIsland.length / Math.PI),
            contours: validContours // Store ALL islands
        });
    }
    // 3. Adjacency
    const edges = [];
    const adjacencySet = new Set();
    const hexToNode = new Map(nodes.map(n => [n.id, n]));
    // Horizontal Scan
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width - 1; x++) {
            const c1 = getPixelColor(data, width, height, x, y, channels);
            const c2 = getPixelColor(data, width, height, x + 1, y, channels);
            if (c1 !== c2 && validColorIds.has(c1) && validColorIds.has(c2)) {
                const h1 = colorMap.get(c1).hex;
                const h2 = colorMap.get(c2).hex;
                adjacencySet.add(h1 < h2 ? `${h1}:${h2}` : `${h2}:${h1}`);
            }
        }
    }
    // Vertical Scan
    for (let y = 0; y < height - 1; y++) {
        for (let x = 0; x < width; x++) {
            const c1 = getPixelColor(data, width, height, x, y, channels);
            const c2 = getPixelColor(data, width, height, x, y + 1, channels);
            if (c1 !== c2 && validColorIds.has(c1) && validColorIds.has(c2)) {
                const h1 = colorMap.get(c1).hex;
                const h2 = colorMap.get(c2).hex;
                adjacencySet.add(h1 < h2 ? `${h1}:${h2}` : `${h2}:${h1}`);
            }
        }
    }
    for (const key of adjacencySet) {
        const [idA, idB] = key.split(':');
        const nodeA = hexToNode.get(idA);
        const nodeB = hexToNode.get(idB);
        if (nodeA && nodeB) {
            const dist = Math.sqrt(Math.pow(nodeB.x - nodeA.x, 2) + Math.pow(nodeB.y - nodeA.y, 2));
            // Forward edge A -> B
            edges.push({
                id: `${idA}-${idB}`,
                sourceNodeId: idA,
                targetNodeId: idB,
                length: dist,
            });
            // Reverse edge B -> A
            edges.push({
                id: `${idB}-${idA}`,
                sourceNodeId: idB,
                targetNodeId: idA,
                length: dist,
            });
            // Update neighbors without duplicates
            const tA = territories.find((t) => t.id === idA);
            const tB = territories.find((t) => t.id === idB);
            if (tA && !tA.neighbors.includes(idB))
                tA.neighbors.push(idB);
            if (tB && !tB.neighbors.includes(idA))
                tB.neighbors.push(idA);
        }
    }
    // 4. Save
    const graph = { nodes, edges };
    const paths = [
        '../../../../packages/shared/src/data',
        '../../assets',
        '../../../client/src/assets'
    ].map(p => path_1.default.resolve(__dirname, p));
    paths.forEach(dir => {
        fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.writeFileSync(path_1.default.join(dir, 'provinces.json'), JSON.stringify(territories, null, 2));
        fs_1.default.writeFileSync(path_1.default.join(dir, 'world-graph.json'), JSON.stringify(graph, null, 2));
    });
    console.log(`✓ COMPLETE: Generated ${territories.length} provinces.`);
}
processMap().catch(console.error);
