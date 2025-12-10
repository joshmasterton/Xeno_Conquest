#!/usr/bin/env ts-node
/**
 * Convert Gaea masks to static territory map
 * 
 * STRATEGY:
 * 1. water_mask_Out.png: Black = land, White = water
 * 2. Territory_Out.png: Each unique grayscale value = one territory
 * 3. Use marching squares to extract smooth contours for each grayscale region
 * 4. Output territories with smooth borders matching the mask exactly
 * 
 * Usage: npm run generate:heightmap-map
 */

import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { Territory, Point } from '@xeno/shared';

interface MaskData {
  width: number;
  height: number;
  data: Uint8Array;
  channels?: number; // 1 for grayscale, 3 for RGB
}

/**
 * Load a mask image (grayscale or RGB)
 */
async function loadMask(filepath: string, rgb: boolean = false): Promise<MaskData> {
  const image = sharp(filepath);
  const pipeline = rgb ? image.raw() : image.greyscale().raw();
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  console.log(`Loaded mask: ${info.width}×${info.height} (${rgb ? 'RGB' : 'grayscale'})`);

  return {
    width: info.width,
    height: info.height,
    data,
    channels: info.channels,
  };
}

/**
 * Calculate RGB color distance
 */
function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/**
 * Find territories using connected component analysis with color similarity
 */
function findColorTerritories(
  waterMask: MaskData,
  territoryMask: MaskData,
  colorThreshold: number = 30
): Map<number, { regions: Set<number>[], color: string }> {
  const { width, height } = waterMask;
  const visited = new Uint8Array(width * height);
  const colorGroups = new Map<string, Set<number>[]>(); // Map color to array of disconnected regions

  console.log(`Finding color territories (similarity threshold: ${colorThreshold})...`);

  // Helper to get RGB
  const getRGB = (idx: number) => {
    return {
      r: territoryMask.data[idx * 3],
      g: territoryMask.data[idx * 3 + 1],
      b: territoryMask.data[idx * 3 + 2]
    };
  };

  // Flood-fill from each unvisited land pixel
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx]) continue;

      const waterValue = waterMask.data[idx];
      const { r, g, b } = getRGB(idx);

      // Skip water (black in territory mask OR white in water mask)
      if (waterValue > 127 || (r === 0 && g === 0 && b === 0)) {
        visited[idx] = 1;
        continue;
      }

      // Start new territory with this color as reference
      const pixels = new Set<number>();
      const queue: number[] = [idx];
      visited[idx] = 1;

      while (queue.length > 0) {
        const current = queue.shift()!;
        pixels.add(current);

        const cx = current % width;
        const cy = Math.floor(current / width);

        // Check 4-connected neighbors
        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

          const nidx = ny * width + nx;
          if (visited[nidx]) continue;

          const nWater = waterMask.data[nidx];
          const nRGB = getRGB(nidx);

          // Skip water
          if (nWater > 127 || (nRGB.r === 0 && nRGB.g === 0 && nRGB.b === 0)) {
            visited[nidx] = 1;
            continue;
          }

          // Check if neighbor color is similar to seed color
          const dist = colorDistance(r, g, b, nRGB.r, nRGB.g, nRGB.b);
          if (dist <= colorThreshold) {
            visited[nidx] = 1;
            queue.push(nidx);
          } else {
            visited[nidx] = 1; // Mark visited but don't include
          }
        }
      }

      // Group regions by color (keep even very small regions for better coverage)
      if (pixels.size > 25) {
        const colorKey = `${r},${g},${b}`;
        if (!colorGroups.has(colorKey)) {
          colorGroups.set(colorKey, []);
        }
        colorGroups.get(colorKey)!.push(pixels);
      }
    }

    if (y % 409 === 0) {
      console.log(`  Progress: ${Math.floor((y / height) * 100)}%`);
    }
  }

  // Merge connected regions with same color
  // If two regions are adjacent (share a border), merge them into one
  const mergedColorGroups = new Map<string, Set<number>[]>();
  
  for (const [colorKey, regions] of colorGroups) {
    const mergedRegions: Set<number>[] = [];
    const regionsMerged = new Set<number>();
    
    for (let i = 0; i < regions.length; i++) {
      if (regionsMerged.has(i)) continue;
      
      const mergedRegion = new Set(regions[i]);
      regionsMerged.add(i);
      
      // Keep merging until no more adjacent regions found
      let foundAdjacent = true;
      while (foundAdjacent) {
        foundAdjacent = false;
        
        // Build boundary pixel set for faster adjacency checking
        const boundaryPixels = new Set<number>();
        for (const pixelIdx of mergedRegion) {
          const px = pixelIdx % width;
          const py = Math.floor(pixelIdx / width);
          
          // Check if this pixel is on the boundary (has at least one non-region neighbor)
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              
              const nx = px + dx;
              const ny = py + dy;
              
              if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
              
              const nidx = ny * width + nx;
              if (!mergedRegion.has(nidx)) {
                boundaryPixels.add(pixelIdx);
                break;
              }
            }
            if (boundaryPixels.has(pixelIdx)) break;
          }
        }
        
        // Check other regions for adjacency using boundary pixels
        for (let j = 0; j < regions.length; j++) {
          if (regionsMerged.has(j)) continue;
          
          // Check if regions are adjacent by checking if any boundary pixel neighbors region j
          let isAdjacent = false;
          
          for (const pixelIdx of boundaryPixels) {
            if (isAdjacent) break;
            
            const px = pixelIdx % width;
            const py = Math.floor(pixelIdx / width);
            
            // Check 8-connected neighbors
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                
                const nx = px + dx;
                const ny = py + dy;
                
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                
                const nidx = ny * width + nx;
                if (regions[j].has(nidx)) {
                  isAdjacent = true;
                  break;
                }
              }
              if (isAdjacent) break;
            }
          }
          
          if (isAdjacent) {
            // Merge region j into mergedRegion
            for (const pixel of regions[j]) {
              mergedRegion.add(pixel);
            }
            regionsMerged.add(j);
            foundAdjacent = true; // Continue searching with expanded region
            break; // Start over with new boundary
          }
        }
      }
      
      mergedRegions.push(mergedRegion);
    }
    
    mergedColorGroups.set(colorKey, mergedRegions);
  }
  
  // Create initial territories from merged regions
  const allRegions: { region: Set<number>, color: string }[] = [];
  for (const [colorKey, regions] of mergedColorGroups) {
    for (const region of regions) {
      allRegions.push({ region, color: colorKey });
    }
  }
  
  // Calculate centroids for each region
  interface RegionInfo {
    region: Set<number>;
    color: string;
    centroid: { x: number, y: number };
    size: number;
  }
  
  const regionsWithInfo: RegionInfo[] = allRegions.map(({ region, color }) => {
    let cx = 0, cy = 0;
    for (const idx of region) {
      cx += idx % width;
      cy += Math.floor(idx / width);
    }
    return {
      region,
      color,
      centroid: { x: cx / region.size, y: cy / region.size },
      size: region.size
    };
  });
  
  // Sort by size descending
  regionsWithInfo.sort((a, b) => b.size - a.size);
  
  // Define small territory threshold - smaller regions get merged to nearest neighbor
  const smallTerritoryThreshold = 15000; // Reduced from 50000 for more granular territories
  const maxMergeDistance = 800; // Maximum centroid distance in pixels to allow merging
  
  // Assign small territories to nearest large territory
  const territoryAssignments = new Map<number, number>(); // region index -> territory ID
  const territories = new Map<number, { regions: Set<number>[], color: string }>();
  let territoryId = 0;
  
  // First pass: Create territories for large regions
  const largeRegions: number[] = [];
  for (let i = 0; i < regionsWithInfo.length; i++) {
    if (regionsWithInfo[i].size >= smallTerritoryThreshold) {
      territories.set(territoryId, { 
        regions: [regionsWithInfo[i].region], 
        color: regionsWithInfo[i].color 
      });
      territoryAssignments.set(i, territoryId);
      largeRegions.push(i);
      territoryId++;
    }
  }
  
  // Second pass: Assign small regions to nearest large territory (within distance limit)
  for (let i = 0; i < regionsWithInfo.length; i++) {
    if (regionsWithInfo[i].size >= smallTerritoryThreshold) continue;
    
    // Find nearest large territory by centroid distance
    let nearestTerritoryId = -1;
    let minDistance = Infinity;
    
    const smallCentroid = regionsWithInfo[i].centroid;
    
    for (const largeIdx of largeRegions) {
      const largeCentroid = regionsWithInfo[largeIdx].centroid;
      const dist = Math.sqrt(
        (smallCentroid.x - largeCentroid.x) ** 2 +
        (smallCentroid.y - largeCentroid.y) ** 2
      );
      
      if (dist < minDistance && dist <= maxMergeDistance) {
        minDistance = dist;
        nearestTerritoryId = territoryAssignments.get(largeIdx)!;
      }
    }
    
    // If no large territories within range, create a new independent territory
    if (nearestTerritoryId === -1) {
      territories.set(territoryId, { 
        regions: [regionsWithInfo[i].region], 
        color: regionsWithInfo[i].color 
      });
      territoryAssignments.set(i, territoryId);
      territoryId++;
    } else {
      // Add this small region to the nearest large territory
      territories.get(nearestTerritoryId)!.regions.push(regionsWithInfo[i].region);
      territoryAssignments.set(i, nearestTerritoryId);
    }
  }
  
  // Final pass: Merge adjacent regions within each territory to eliminate internal borders
  for (const [id, data] of territories) {
    const regions = data.regions;
    if (regions.length <= 1) continue; // Skip territories with only one region
    
    const finalMerged: Set<number>[] = [];
    const regionsMerged = new Set<number>();
    
    for (let i = 0; i < regions.length; i++) {
      if (regionsMerged.has(i)) continue;
      
      const mergedRegion = new Set(regions[i]);
      regionsMerged.add(i);
      
      // Keep merging adjacent regions
      let foundAdjacent = true;
      while (foundAdjacent) {
        foundAdjacent = false;
        
        for (let j = 0; j < regions.length; j++) {
          if (regionsMerged.has(j)) continue;
          
          // Check if regions are adjacent (8-connected)
          let isAdjacent = false;
          
          // Only check boundary pixels for efficiency
          outerCheck: for (const pixelIdx of mergedRegion) {
            const px = pixelIdx % width;
            const py = Math.floor(pixelIdx / width);
            
            // Check 8-connected neighbors
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                
                const nx = px + dx;
                const ny = py + dy;
                
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                
                const nidx = ny * width + nx;
                if (regions[j].has(nidx)) {
                  isAdjacent = true;
                  break outerCheck;
                }
              }
            }
          }
          
          if (isAdjacent) {
            // Merge region j into mergedRegion
            for (const pixel of regions[j]) {
              mergedRegion.add(pixel);
            }
            regionsMerged.add(j);
            foundAdjacent = true;
            break; // Start over with expanded region
          }
        }
      }
      
      finalMerged.push(mergedRegion);
    }
    
    // Update territory with merged regions
    territories.set(id, { regions: finalMerged, color: data.color });
  }
  
  // Log territory info
  for (const [id, data] of territories) {
    const totalPixels = data.regions.reduce((sum, region) => sum + region.size, 0);
    console.log(`  Territory ${id + 1}: ${totalPixels} pixels (${data.regions.length} region${data.regions.length > 1 ? 's' : ''})`);
  }

  return territories;
}

/**
 * Trace the outer boundary of a region using Moore-neighbor tracing
 */
function traceOuterBoundary(
  pixels: Set<number>,
  width: number,
  height: number
): Point[] {
  // Find starting point (topmost-leftmost pixel)
  let startIdx = -1;
  for (const idx of pixels) {
    if (startIdx === -1 || idx < startIdx) {
      startIdx = idx;
    }
  }

  if (startIdx === -1) return [];

  const boundary: Point[] = [];
  const startX = startIdx % width;
  const startY = Math.floor(startIdx / width);
  
  let x = startX;
  let y = startY;
  let dir = 0; // Start facing right
  
  // Direction vectors: E, SE, S, SW, W, NW, N, NE
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];
  
  const maxSteps = pixels.size * 4;
  let steps = 0;

  do {
    boundary.push({ x, y });
    
    // Look for next boundary pixel (clockwise from left of current direction)
    let foundNext = false;
    const startDir = (dir + 5) % 8; // Start checking 90° to the left
    
    for (let i = 0; i < 8; i++) {
      const checkDir = (startDir + i) % 8;
      const nx = x + dx[checkDir];
      const ny = y + dy[checkDir];
      
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      
      const nidx = ny * width + nx;
      
      if (pixels.has(nidx)) {
        x = nx;
        y = ny;
        dir = checkDir;
        foundNext = true;
        break;
      }
    }
    
    if (!foundNext) break;
    
    steps++;
    
    // Stop if we've returned to start
    if (steps > 20 && x === startX && y === startY) break;
    
  } while (steps < maxSteps);

  return boundary;
}

/**
 * Trace boundary of a territory using Moore-Neighbor tracing
 * Returns ALL boundary pixels in order
 */
function traceTerritoryBoundary(
  territory: Set<number>,
  width: number,
  height: number
): Point[] {
  // Find starting boundary pixel (topmost, then leftmost)
  let startX = -1, startY = -1;
  
  outerLoop: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (territory.has(idx)) {
        // Check if it's a boundary pixel (has at least one non-territory neighbor)
        const hasExterior = 
          (x === 0 || !territory.has(y * width + (x - 1))) ||
          (x === width - 1 || !territory.has(y * width + (x + 1))) ||
          (y === 0 || !territory.has((y - 1) * width + x)) ||
          (y === height - 1 || !territory.has((y + 1) * width + x));
        
        if (hasExterior) {
          startX = x;
          startY = y;
          break outerLoop;
        }
      }
    }
  }

  if (startX === -1) return [];

  const boundary: Point[] = [];
  let x = startX, y = startY;
  let dir = 0; // Start facing East
  
  // Direction vectors (N, NE, E, SE, S, SW, W, NW)
  const dx = [0, 1, 1, 1, 0, -1, -1, -1];
  const dy = [-1, -1, 0, 1, 1, 1, 0, -1];
  
  const maxSteps = territory.size * 4;
  let steps = 0;

  do {
    boundary.push({ x, y });
    
    // Look for next boundary pixel starting from left of current direction
    let foundNext = false;
    const startDir = (dir + 6) % 8; // Start checking from 90° left (counterclockwise)
    
    for (let i = 0; i < 8; i++) {
      const checkDir = (startDir + i) % 8;
      const nx = x + dx[checkDir];
      const ny = y + dy[checkDir];
      
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      
      const nidx = ny * width + nx;
      
      if (territory.has(nidx)) {
        // Found next boundary pixel
        x = nx;
        y = ny;
        dir = checkDir;
        foundNext = true;
        break;
      }
    }
    
    if (!foundNext) break;
    
    steps++;
    
    // Stop if we've returned to start position and direction
    if (steps > 20 && x === startX && y === startY) break;
    
  } while (steps < maxSteps);

  return boundary;
}

/**
 * Smooth polygon using Chaikin's corner cutting algorithm
 */
function smoothPolygon(points: Point[], iterations: number = 2): Point[] {
  let result = [...points];
  
  for (let iter = 0; iter < iterations; iter++) {
    const smoothed: Point[] = [];
    
    for (let i = 0; i < result.length; i++) {
      const p1 = result[i];
      const p2 = result[(i + 1) % result.length];
      
      // Create two new points at 1/4 and 3/4 along the edge
      smoothed.push({
        x: 0.75 * p1.x + 0.25 * p2.x,
        y: 0.75 * p1.y + 0.25 * p2.y
      });
      smoothed.push({
        x: 0.25 * p1.x + 0.75 * p2.x,
        y: 0.25 * p1.y + 0.75 * p2.y
      });
    }
    
    result = smoothed;
  }
  
  return result;
}

/**
 * Simplify polygon using Douglas-Peucker-style downsampling
 */
function simplifyPolygon(points: Point[], targetVertices: number): Point[] {
  if (points.length <= targetVertices) return points;

  const simplified: Point[] = [];
  const step = Math.max(1, Math.floor(points.length / targetVertices));

  for (let i = 0; i < points.length; i += step) {
    simplified.push(points[i]);
  }

  // Ensure closed loop
  if (simplified.length > 0 && 
      (simplified[0].x !== simplified[simplified.length - 1].x ||
       simplified[0].y !== simplified[simplified.length - 1].y)) {
    simplified.push(simplified[0]);
  }

  return simplified;
}

/**
 * Convert pixel coordinates to world space (2500×2500)
 */
function pixelToWorld(pixelX: number, pixelY: number, maskWidth: number, maskHeight: number): Point {
  const worldWidth = 2500;
  const worldHeight = 2500;
  return {
    x: (pixelX / maskWidth) * worldWidth,
    y: (pixelY / maskHeight) * worldHeight,
  };
}

/**
 * Main conversion function
 */
async function convertMasksToMap() {
  const waterMaskPath = path.join(__dirname, '../assets/water_mask_Out.png');
  const territoryMaskPath = path.join(__dirname, '../assets/Territories_Out.png');
  const outputPath = path.join(__dirname, '../../client/src/assets/staticMap.json');

  console.log('=== Gaea Mask Territory Generator ===\n');

  console.log('Loading water mask (black=land, white=water)...');
  const waterMask = await loadMask(waterMaskPath, false);

  console.log('Loading territory mask (RGB colors = different territories)...');
  const territoryMask = await loadMask(territoryMaskPath, true);

  if (waterMask.width !== territoryMask.width || waterMask.height !== territoryMask.height) {
    throw new Error('Mask dimensions must match!');
  }

  console.log(`\nProcessing ${waterMask.width}×${waterMask.height} masks...\n`);

  const territoryMap = findColorTerritories(waterMask, territoryMask, 30);
  console.log(`\n✓ Found ${territoryMap.size} territories\n`);

  const territories: Territory[] = [];

  console.log('Extracting territory boundaries...');
  for (const [territoryId, territoryData] of territoryMap) {
    const { regions } = territoryData;
    const totalPixels = regions.reduce((sum, region) => sum + region.size, 0);
    
    console.log(`  Territory ${territoryId + 1}/${territoryMap.size}: ${totalPixels} pixels (${regions.length} region${regions.length > 1 ? 's' : ''})`);
    
    // Process each disconnected region as a separate polygon
    const polygons: Point[][] = [];
    let allPolygonPoints: Point[] = [];
    
    for (let regionIdx = 0; regionIdx < regions.length; regionIdx++) {
      const region = regions[regionIdx];
      console.log(`    Region ${regionIdx + 1}/${regions.length}: ${region.size} pixels`);
      
      const boundaryPixels = traceOuterBoundary(region, waterMask.width, waterMask.height);
      
      if (boundaryPixels.length < 3) {
        console.log(`      ⚠ Skipped (insufficient boundary)`);
        continue;
      }

      console.log(`      Found ${boundaryPixels.length} boundary pixels`);

      // Smooth the jagged pixel edges (2 iterations for high quality)
      const smoothed = smoothPolygon(boundaryPixels, 2);
      console.log(`      Smoothed to ${smoothed.length} vertices`);
      
      // Then simplify to reduce vertex count (high quality: 800 vertices max)
      const targetVertices = Math.min(800, Math.floor(smoothed.length / 1.5));
      const simplified = simplifyPolygon(smoothed, targetVertices);
      console.log(`      Simplified to ${simplified.length} vertices`);

      // Convert to world space
      const polygon: Point[] = simplified.map(p =>
        pixelToWorld(p.x, p.y, waterMask.width, waterMask.height)
      );

      polygons.push(polygon);
      allPolygonPoints.push(...polygon);
    }

    if (polygons.length === 0) {
      console.log(`    ⚠ Skipped territory (no valid polygons)`);
      continue;
    }

    // Calculate centroid from all regions (use largest region's center)
    const largestPolygon = polygons.reduce((largest, poly) => 
      poly.length > largest.length ? poly : largest
    );
    let cx = 0, cy = 0;
    for (const p of largestPolygon) {
      cx += p.x;
      cy += p.y;
    }
    const centroid = { x: cx / largestPolygon.length, y: cy / largestPolygon.length };

    // Store all polygons (for rendering islands) and primary polygon (for backwards compat)
    territories.push({
      id: `t-${territoryId}`,
      name: `Territory ${territoryId}`,
      centroid,
      polygon: largestPolygon,
      polygons: polygons, // All regions including islands
    });
  }

  // Write output
  console.log('\nWriting staticMap.json...');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    JSON.stringify({ territories }, null, 2)
  );

  console.log(`\n✅ Generated ${territories.length} territories from Gaea masks`);
  console.log(`📁 Output: ${outputPath}`);
  console.log(`\nTerritory sizes:`);
  territories.forEach(t => {
    console.log(`  ${t.name}: ${t.polygon.length} vertices`);
  });
}

convertMasksToMap().catch(console.error);
