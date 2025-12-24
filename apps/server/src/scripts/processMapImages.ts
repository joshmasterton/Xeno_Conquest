import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { RoadNode, RoadEdge } from '@xeno/shared';

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

      // Unique Color Integer ID (Fastest map key)
      const colorId = (r << 16) | (g << 8) | b;

      // A. Update Centroid Stats
      let stats = territoryStats.get(colorId);
      if (!stats) {
        // Convert to Hex for human readability later
        const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        stats = { sumX: 0, sumY: 0, count: 0, hex };
        territoryStats.set(colorId, stats);
      }
      stats.sumX += x;
      stats.sumY += y;
      stats.count++;

      // B. Check Neighbors (Right and Down) to find edges
      // We only need to check forward directions to catch every border once.
      
      // Check Right Neighbor (x + 1)
      if (x < width - 1) {
        const nIdx = idx + channels; // Next pixel
        const nr = data[nIdx];
        const ng = data[nIdx + 1];
        const nb = data[nIdx + 2];
        const nColorId = (nr << 16) | (ng << 8) | nb;

        if (colorId !== nColorId) {
          const edgeKey = colorId < nColorId 
            ? `${colorId}:${nColorId}` 
            : `${nColorId}:${colorId}`;
          adjacencySet.add(edgeKey);
        }
      }

      // Check Bottom Neighbor (y + 1)
      if (y < height - 1) {
        const nIdx = ((y + 1) * width + x) * channels;
        const nr = data[nIdx];
        const ng = data[nIdx + 1];
        const nb = data[nIdx + 2];
        const nColorId = (nr << 16) | (ng << 8) | nb;

        if (colorId !== nColorId) {
          const edgeKey = colorId < nColorId 
            ? `${colorId}:${nColorId}` 
            : `${nColorId}:${colorId}`;
          adjacencySet.add(edgeKey);
        }
      }
    }
  }

  console.log(`Found ${territoryStats.size} raw color regions.`);
  console.log(`Filtering noise (< ${MIN_PIXEL_COUNT} pixels)...`);

  // 3. Generate Nodes (Centroids)
  const nodes: RoadNode[] = [];
  const validColorIds = new Set<number>();

  for (const [colorId, stats] of territoryStats.entries()) {
    if (stats.count < MIN_PIXEL_COUNT) continue; // Skip noise

    validColorIds.add(colorId);

    nodes.push({
      id: stats.hex, // Use hex color as ID for now
      x: Math.round(stats.sumX / stats.count),
      y: Math.round(stats.sumY / stats.count),
    });
  }

  console.log(`Generated ${nodes.length} valid Nodes.`);

  // 4. Generate Edges
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

  console.log('\n[GraphGen] Map processing complete!');
}

processMap().catch(err => console.error(err));
