import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { RoadNode, RoadEdge, Territory } from '@xeno/shared';

const ASSETS_DIR = path.join(__dirname, '../../assets');
const WATER_COLOR = 0x000000; // Black = water
const MIN_PIXELS = 200; // Minimum pixels for a province
const RDP_TOLERANCE = 0.1; // Ramer-Douglas-Peucker simplification tolerance (minimal)

interface ColorRegion {
  colorId: number;
  hex: string;
  pixels: Array<[number, number]>;
  centroidX: number;
  centroidY: number;
}

function getPixelColor(data: Buffer, width: number, x: number, y: number, channels: number): number {
  if (x < 0 || x >= width || y < 0) return -1;
  const idx = (y * width + x) * channels;
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  return (r << 16) | (g << 8) | b;
}

/**
 * Extract boundary pixels and order them by walking around the perimeter.
 * If walk fails, fall back to convex hull of all pixels.
 */
function traceContour(region: ColorRegion): [number, number][] {
  if (region.pixels.length === 0) return [];
  
  const pixelSet = new Set(region.pixels.map(p => `${p[0]},${p[1]}`));
  const boundary: [number, number][] = [];
  
  // Find all boundary pixels (adjacent to at least one non-region pixel)
  for (const [x, y] of region.pixels) {
    let isBoundary = false;
    // Check 8 neighbors
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (!pixelSet.has(`${x + dx},${y + dy}`)) {
          isBoundary = true;
          break;
        }
      }
      if (isBoundary) break;
    }
    if (isBoundary) boundary.push([x, y]);
  }
  
  if (boundary.length < 3) {
    // Fallback: use convex hull of all pixels
    return convexHull(region.pixels);
  }
  
  // Find top-left boundary pixel as start
  let start = boundary[0];
  for (const p of boundary) {
    if (p[1] < start[1] || (p[1] === start[1] && p[0] < start[0])) {
      start = p;
    }
  }
  
  // Walk the boundary using 8-connectivity Moore neighborhood
  const contour: [number, number][] = [];
  const visited = new Set<string>();
  let current = start;
  let prevDir = 2; // Start looking in direction "up" (index 2 in dirs array)
  
  // 8 directions: E, SE, S, SW, W, NW, N, NE
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  
  while (contour.length < boundary.length * 2) {
    contour.push(current);
    visited.add(`${current[0]},${current[1]}`);
    
    // Look for next boundary pixel, starting from (prevDir + 6) % 8
    let found = false;
    for (let i = 0; i < 8; i++) {
      const dir = dirs[(prevDir + 6 + i) % 8];
      const nx = current[0] + dir[0];
      const ny = current[1] + dir[1];
      const nkey = `${nx},${ny}`;
      
      if (pixelSet.has(nkey) && !visited.has(nkey)) {
        current = [nx, ny];
        prevDir = (prevDir + 6 + i) % 8;
        found = true;
        break;
      }
    }
    
    // If we're back at start with at least 10 points, we've traced the boundary
    if (!found || (contour.length > 10 && current[0] === start[0] && current[1] === start[1])) {
      break;
    }
  }
  
  return contour.length < 3 ? convexHull(region.pixels) : contour;
}

/**
 * Compute convex hull using Graham scan for small/scattered regions.
 * Falls back to angle-sorted pixels if hull is too small.
 */
function convexHull(pixels: Array<[number, number]>): [number, number][] {
  if (pixels.length < 3) return [];
  if (pixels.length === 3) return [...pixels];
  
  // Find centroid
  const cx = pixels.reduce((s, p) => s + p[0], 0) / pixels.length;
  const cy = pixels.reduce((s, p) => s + p[1], 0) / pixels.length;
  
  // Sort by angle from centroid
  const sorted = [...pixels].sort((a, b) => {
    const angleA = Math.atan2(a[1] - cy, a[0] - cx);
    const angleB = Math.atan2(b[1] - cy, b[0] - cx);
    return angleA - angleB;
  });
  
  // If we have a valid sorted set, use it
  if (sorted.length >= 3) {
    return sorted;
  }
  
  return [];
}

/**
 * Ramer-Douglas-Peucker simplification.
 */
function simplifyContour(points: [number, number][], tolerance: number): [number, number][] {
  if (points.length <= 2) return points;
  
  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];
  
  for (let i = 1; i < points.length - 1; i++) {
    const dist = pointToLineDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }
  
  if (maxDist > tolerance) {
    const left = simplifyContour(points.slice(0, maxIdx + 1), tolerance);
    const right = simplifyContour(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }
  
  return [start, end];
}

function pointToLineDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const num = Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1]));
  const den = Math.sqrt(Math.pow(b[0] - a[0], 2) + Math.pow(b[1] - a[1], 2));
  return den === 0 ? 0 : num / den;
}

async function processMap() {
  console.log('Loading provinces.png...');
  
  const buffer = await sharp(path.join(ASSETS_DIR, 'provinces.png'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  const { data, info } = buffer;
  const width = info.width;
  const height = info.height;
  const channels = info.channels;
  
  console.log(`Processing ${width}x${height} image`);
  
  // Step 1: Count pixel frequency by color
  const colorFrequency = new Map<number, number>();
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const colorId = getPixelColor(data, width, x, y, channels);
      if (colorId === WATER_COLOR || colorId === -1) continue;
      colorFrequency.set(colorId, (colorFrequency.get(colorId) || 0) + 1);
    }
  }
  
  // Sort by frequency and keep only colors that appear often (major provinces)
  const frequentColors = Array.from(colorFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .filter(([color, count]) => count >= MIN_PIXELS)
    .map(([color]) => color);
  
  console.log(`Found ${frequentColors.length} provinces (from ${colorFrequency.size} total unique colors)`);
  
  // Step 2: Group pixels by frequent color
  const colorMap = new Map<number, ColorRegion>();
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const colorId = getPixelColor(data, width, x, y, channels);
      
      if (!frequentColors.includes(colorId)) continue;
      
      if (!colorMap.has(colorId)) {
        const hex = `#${colorId.toString(16).padStart(6, '0')}`;
        colorMap.set(colorId, {
          colorId,
          hex,
          pixels: [],
          centroidX: 0,
          centroidY: 0,
        });
      }
      
      colorMap.get(colorId)!.pixels.push([x, y]);
    }
  }
  
  // Step 3: Create territories
  const nodes: RoadNode[] = [];
  const territories: Territory[] = [];
  const colorToId = new Map<number, string>();
  
  for (const [colorId, region] of colorMap) {
    // Compute centroid
    const sumX = region.pixels.reduce((acc, p) => acc + p[0], 0);
    const sumY = region.pixels.reduce((acc, p) => acc + p[1], 0);
    region.centroidX = Math.round(sumX / region.pixels.length);
    region.centroidY = Math.round(sumY / region.pixels.length);
    
    // Trace & simplify boundary
    const rawContour = traceContour(region);
    const contour = simplifyContour(rawContour, RDP_TOLERANCE);
    
    colorToId.set(colorId, region.hex);
    
    nodes.push({
      id: region.hex,
      x: region.centroidX,
      y: region.centroidY,
    });
    
    territories.push({
      id: region.hex,
      x: region.centroidX,
      y: region.centroidY,
      pixelCount: region.pixels.length,
      neighbors: [],
      radius: Math.sqrt(region.pixels.length / Math.PI),
      contour: contour.length >= 3 ? contour : undefined,
    });
  }
  
  console.log(`Generated ${territories.length} territories`);
  
  // Step 4: Detect adjacency
  const adjacencySet = new Set<string>();
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const colorId = getPixelColor(data, width, x, y, channels);
      if (!colorToId.has(colorId)) continue;
      
      // Check right and bottom neighbors
      const rightColor = getPixelColor(data, width, x + 1, y, channels);
      if (rightColor !== WATER_COLOR && rightColor !== colorId && colorToId.has(rightColor)) {
        const a = colorToId.get(colorId)!;
        const b = colorToId.get(rightColor)!;
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        adjacencySet.add(key);
      }
      
      const bottomColor = getPixelColor(data, width, x, y + 1, channels);
      if (bottomColor !== WATER_COLOR && bottomColor !== colorId && colorToId.has(bottomColor)) {
        const a = colorToId.get(colorId)!;
        const b = colorToId.get(bottomColor)!;
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        adjacencySet.add(key);
      }
    }
  }
  
  // Step 5: Create edges
  const edges: RoadEdge[] = [];
  
  for (const adj of adjacencySet) {
    const [hexA, hexB] = adj.split(':');
    
    const nodeA = nodes.find(n => n.id === hexA);
    const nodeB = nodes.find(n => n.id === hexB);
    if (!nodeA || !nodeB) continue;
    
    const dist = Math.sqrt(Math.pow(nodeB.x - nodeA.x, 2) + Math.pow(nodeB.y - nodeA.y, 2));
    const edgeId = [hexA, hexB].sort().join('-');
    
    edges.push({
      id: edgeId,
      sourceNodeId: hexA,
      targetNodeId: hexB,
      length: dist,
    });
    
    // Update neighbors
    const tA = territories.find(t => t.id === hexA);
    const tB = territories.find(t => t.id === hexB);
    if (tA && !tA.neighbors.includes(hexB)) tA.neighbors.push(hexB);
    if (tB && !tB.neighbors.includes(hexA)) tB.neighbors.push(hexA);
  }
  
  console.log(`Created ${edges.length} edges`);
  
  // Step 5: Save output
  const worldGraph = { nodes, edges };
  
  const sharedDir = path.resolve(__dirname, '../../../../packages/shared/src/data');
  const serverDir = path.resolve(__dirname, '../../assets');
  const clientDir = path.resolve(__dirname, '../../../client/src/assets');
  
  [sharedDir, serverDir, clientDir].forEach(d => fs.mkdirSync(d, { recursive: true }));
  
  fs.writeFileSync(path.join(sharedDir, 'provinces.json'), JSON.stringify(territories, null, 2));
  fs.writeFileSync(path.join(sharedDir, 'world-graph.json'), JSON.stringify(worldGraph, null, 2));
  fs.writeFileSync(path.join(serverDir, 'provinces.json'), JSON.stringify(territories, null, 2));
  fs.writeFileSync(path.join(serverDir, 'graph.json'), JSON.stringify(worldGraph, null, 2));
  fs.writeFileSync(path.join(clientDir, 'provinces.json'), JSON.stringify(territories, null, 2));
  fs.writeFileSync(path.join(clientDir, 'graph.json'), JSON.stringify(worldGraph, null, 2));
  
  console.log(`✓ Saved ${territories.length} provinces with boundaries`);
}

processMap().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
