import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { RoadNode, RoadEdge, Territory } from '@xeno/shared';

const ASSETS_DIR = path.join(__dirname, '../../assets');

// Tunable: Ignore territories smaller than this (removes anti-aliasing noise)
const MIN_PIXEL_COUNT = 50; 

// Helper to create a unique ID for edges
const getEdgeId = (a: string, b: string) => [a, b].sort().join('-');

async function processMap() {
  console.log('Loading images...');

  // 1. Load the Province Map (Raw Pixel Data)
  const provinceBuffer = await sharp(path.join(ASSETS_DIR, 'provinces.png'))
    .ensureAlpha() // Ensure we have 4 channels (RGBA)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = provinceBuffer;
  const width = info.width;
  const height = info.height;
  const channels = info.channels; // Should be 4 (RGBA)

  console.log(`Processing ${width}x${height} image...`);

  // Data structures to store stats per color
  // Key = Color Integer (R << 24 | G << 16 | B << 8 | A)
  const territoryStats = new Map<number, { 
    sumX: number; 
    sumY: number; 
    count: number;
    hex: string;
  }>();

  // Store connections as "ColorIntA:ColorIntB" string
  const adjacencySet = new Set<string>();

  // Boundary pixels per territory colorId: Set of "x,y"
  const boundaryByColor = new Map<number, Set<string>>();

  // Helper to get pixel color at location
  const getPixelColor = (x: number, y: number): number => {
    if (x < 0 || x >= width || y < 0 || y >= height) return -1;
    const idx = (y * width + x) * channels;
    return (data[idx] << 16) | (data[idx + 1] << 8) | data[idx + 2];
  };

  // 2. Single Pass: Scan Pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      // Skip transparent pixels if any
      if (a < 128) continue;

      // Unique Color Integer ID
      const colorId = (r << 16) | (g << 8) | b;

      // A. Update Centroid Stats
      let stats = territoryStats.get(colorId);
      if (!stats) {
        const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        stats = { sumX: 0, sumY: 0, count: 0, hex };
        territoryStats.set(colorId, stats);
      }
      stats.sumX += x;
      stats.sumY += y;
      stats.count++;

      // B. Detect if boundary: check all 8 neighbors
      const neighborDirs = [
        [-1, -1], [0, -1], [1, -1],
        [-1,  0],          [1,  0],
        [-1,  1], [0,  1], [1,  1]
      ];
      
      for (const [dx, dy] of neighborDirs) {
        const nx = x + dx, ny = y + dy;
        const nColor = getPixelColor(nx, ny);
        if (nColor !== colorId && nColor >= 0) {
          // This is a boundary pixel and neighbor is valid
          if (!boundaryByColor.has(colorId)) boundaryByColor.set(colorId, new Set());
          boundaryByColor.get(colorId)!.add(`${x},${y}`);
          
          // Record edge if neighbor is not black/water
          if (nColor !== 0) {
            const edgeKey = colorId < nColor ? `${colorId}:${nColor}` : `${nColor}:${colorId}`;
            adjacencySet.add(edgeKey);
          }
          break;
        }
      }
    }
  }

  console.log(`Found ${territoryStats.size} raw color regions.`);
  console.log(`Filtering noise (< ${MIN_PIXEL_COUNT} pixels)...`);

  // 3. Generate Nodes (Centroids)
  const nodes: RoadNode[] = [];
  const validColorIds = new Set<number>();
  const territories: Territory[] = [];

  for (const [colorId, stats] of territoryStats.entries()) {
    if (stats.count < MIN_PIXEL_COUNT) continue; // Skip noise
    // Treat pure black (#000000) regions as water: skip creating territories/nodes
    if (colorId === 0) continue;

    validColorIds.add(colorId);

    const cx = Math.round(stats.sumX / stats.count);
    const cy = Math.round(stats.sumY / stats.count);

    nodes.push({
      id: stats.hex,
      x: cx,
      y: cy,
    });

    territories.push({
      id: stats.hex,
      x: cx,
      y: cy,
      pixelCount: stats.count,
      neighbors: [], // fill after edges
      radius: Math.sqrt(stats.count / Math.PI),
    });
  }

  console.log(`Generated ${nodes.length} valid Nodes.`);

  // 4. Generate Edges + territory adjacency
  const edges: RoadEdge[] = [];
  
  for (const connection of adjacencySet) {
    const [idA, idB] = connection.split(':').map(Number);

    // Only create edges between valid (non-noise) territories
    if (validColorIds.has(idA) && validColorIds.has(idB)) {
      const nodeA = nodes.find(n => n.id === territoryStats.get(idA)!.hex)!;
      const nodeB = nodes.find(n => n.id === territoryStats.get(idB)!.hex)!;

      // Calculate Euclidean Distance
      const dist = Math.sqrt(
        Math.pow(nodeB.x - nodeA.x, 2) + Math.pow(nodeB.y - nodeA.y, 2)
      );

      const edgeId = getEdgeId(nodeA.id, nodeB.id);
      
      edges.push({
        id: edgeId,
        sourceNodeId: nodeA.id,
        targetNodeId: nodeB.id,
        length: dist
      });

      // territory neighbors
      const tA = territories.find(t => t.id === nodeA.id);
      const tB = territories.find(t => t.id === nodeB.id);
      if (tA && !tA.neighbors.includes(nodeB.id)) tA.neighbors.push(nodeB.id);
      if (tB && !tB.neighbors.includes(nodeA.id)) tB.neighbors.push(nodeA.id);
    }
  }

  console.log(`Generated ${edges.length} Edges.`);

  // 5. Define Output Paths
  const serverOutputDir = path.resolve(__dirname, '../../assets');
  const clientOutputDir = path.resolve(__dirname, '../../../client/src/assets');
  const sharedOutputDir = path.resolve(__dirname, '../../../../packages/shared/src/data');

  // 6. Define File Names
  const serverGraphPath = path.resolve(serverOutputDir, 'graph.json');
  const clientGraphPath = path.resolve(clientOutputDir, 'graph.json');
  const sharedGraphPath = path.resolve(sharedOutputDir, 'world-graph.json');

  // 7. Ensure Directories Exist
  fs.mkdirSync(serverOutputDir, { recursive: true });
  fs.mkdirSync(clientOutputDir, { recursive: true });
  fs.mkdirSync(sharedOutputDir, { recursive: true });

  // Optional water mask: if present, mark territories with isWater=true based on centroid pixel
  const waterPath = path.join(ASSETS_DIR, 'water.png');
  if (fs.existsSync(waterPath)) {
    try {
      const waterBuf = await sharp(waterPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const wdata = waterBuf.data;
      const winfo = waterBuf.info;
      for (const t of territories) {
        if (t.x < 0 || t.y < 0 || t.x >= winfo.width || t.y >= winfo.height) continue;
        const widx = (t.y * winfo.width + t.x) * winfo.channels;
        const wr = wdata[widx];
        const wg = wdata[widx + 1];
        const wb = wdata[widx + 2];
        // Simple heuristic: blue-dominant pixel means water
        t.isWater = wb > 150 && wb > wr + 30 && wb > wg + 30;
      }
      console.log(`✓ Applied water mask for ${territories.length} territories.`);
    } catch (err) {
      console.warn('⚠ Failed to apply water mask:', err);
    }
  }

  const graph = { nodes, edges };

  // 8. Save to All Three Locations
  // Server assets (for local reference)
  try {
    fs.writeFileSync(serverGraphPath, JSON.stringify(graph, null, 2), 'utf-8');
    console.log(`✓ Graph saved to Server: ${serverGraphPath}`);
  } catch (e) {
    console.warn(`[GraphGen] Could not write server graph:`, e);
  }

  // Client assets
  try {
    fs.writeFileSync(clientGraphPath, JSON.stringify(graph, null, 2), 'utf-8');
    console.log(`✓ Graph saved to Client: ${clientGraphPath}`);
  } catch (e) {
    console.warn(`[GraphGen] Could not write client graph:`, e);
  }

  // Shared (CRITICAL - Source of Truth for GameLoop)
  try {
    fs.writeFileSync(sharedGraphPath, JSON.stringify(graph, null, 2), 'utf-8');
    console.log(`✓ Graph saved to Shared: ${sharedGraphPath}`);
  } catch (e) {
    console.error(`[GraphGen] FAILED to write shared graph:`, e);
    process.exit(1);
  }

  // Provinces metadata
  const serverProvPath = path.resolve(serverOutputDir, 'provinces.json');
  const clientProvPath = path.resolve(clientOutputDir, 'provinces.json');
  const sharedProvPath = path.resolve(sharedOutputDir, 'provinces.json');

  try {
    // Before writing provinces, compute polygon contours from boundary pixels
    const contourForHex = new Map<string, [number, number][]>();

    const convexHull = (points: [number, number][]): [number, number][] => {
      if (points.length <= 3) return points;
      
      // Graham scan for convex hull
      points.sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]);
      
      const cross = (o: [number, number], a: [number, number], b: [number, number]) => {
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      };
      
      const lower: [number, number][] = [];
      for (let i = 0; i < points.length; i++) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], points[i]) <= 0) {
          lower.pop();
        }
        lower.push(points[i]);
      }
      
      const upper: [number, number][] = [];
      for (let i = points.length - 1; i >= 0; i--) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0) {
          upper.pop();
        }
        upper.push(points[i]);
      }
      
      lower.pop();
      upper.pop();
      return lower.concat(upper);
    };

    for (const [colorId, stats] of territoryStats.entries()) {
      if (!validColorIds.has(colorId)) continue;
      const hex = stats.hex;
      const boundary = boundaryByColor.get(colorId) || new Set<string>();
      
      if (boundary.size === 0) continue;
      
      // Convert boundary to points
      const points = Array.from(boundary).map(k => {
        const [x, y] = k.split(',').map(Number);
        return [x, y] as [number, number];
      });
      
      // Compute convex hull for clean province boundary
      const hull = convexHull(points);
      contourForHex.set(hex, hull);
    }
    
    // attach contour to territories
    for (const t of territories) {
      const c = contourForHex.get(t.id);
      if (c && c.length >= 3) t.contour = c;
    }

    fs.writeFileSync(serverProvPath, JSON.stringify(territories, null, 2), 'utf-8');
    console.log(`✓ Provinces saved to Server: ${serverProvPath}`);
  } catch (e) {
    console.warn(`[GraphGen] Could not write server provinces:`, e);
  }
  try {
    fs.writeFileSync(clientProvPath, JSON.stringify(territories, null, 2), 'utf-8');
    console.log(`✓ Provinces saved to Client: ${clientProvPath}`);
  } catch (e) {
    console.warn(`[GraphGen] Could not write client provinces:`, e);
  }
  try {
    fs.writeFileSync(sharedProvPath, JSON.stringify(territories, null, 2), 'utf-8');
    console.log(`✓ Provinces saved to Shared: ${sharedProvPath}`);
  } catch (e) {
    console.error(`[GraphGen] FAILED to write shared provinces:`, e);
  }

  console.log('\n[GraphGen] Map processing complete!');
}

processMap().catch(err => console.error(err));
