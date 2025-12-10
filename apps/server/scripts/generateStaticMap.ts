#!/usr/bin/env ts-node
/**
 * Generate static map data and save to client assets
 * Run once: npm run generate:map
 * Map geometry is bundled with client, never sent over network
 */

import * as fs from 'fs';
import * as path from 'path';

// Copy the territory generation logic here
function generateStaticMap() {
  // Get seed from command line or use random
  const seedArg = process.argv[2];
  const mapSeed = seedArg ? parseInt(seedArg) : Math.floor(Math.random() * 1000000);
  console.log(`Using map seed: ${mapSeed}`);
  
  // Seeded random using simple LCG
  let rng = mapSeed;
  const random = () => {
    rng = (rng * 9301 + 49297) % 233280;
    return rng / 233280;
  };
  
  const worldSize = 2000;
  const seeds: { x: number; y: number }[] = [];
  
  // Perlin-like noise function
  const noise = (x: number, y: number, scale: number = 0.01) => {
    const xi = Math.floor(x * scale);
    const yi = Math.floor(y * scale);
    const xf = (x * scale) - xi;
    const yf = (y * scale) - yi;
    
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    
    const hash = (i: number, j: number) => {
      const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
      return h - Math.floor(h);
    };
    
    const n00 = hash(xi, yi);
    const n10 = hash(xi + 1, yi);
    const n01 = hash(xi, yi + 1);
    const n11 = hash(xi + 1, yi + 1);
    
    const nx0 = n00 * (1 - u) + n10 * u;
    const nx1 = n01 * (1 - u) + n11 * u;
    return nx0 * (1 - v) + nx1 * v;
  };
  
  const elevation = (x: number, y: number) => {
    // DOMAIN WARPING: Distort coordinate space for organic shapes
    const warpScale = 80;
    const warpX = noise(x, y, 0.001) * warpScale;
    const warpY = noise(x + 500, y + 500, 0.001) * warpScale;
    const wx = x + warpX;
    const wy = y + warpY;
    
    // Secondary warp for complexity
    const warp2Scale = 40;
    const warp2X = noise(wx, wy, 0.002) * warp2Scale;
    const warp2Y = noise(wx + 300, wy + 300, 0.002) * warp2Scale;
    const wwx = wx + warp2X;
    const wwy = wy + warp2Y;
    
    // LARGE SCALE: Continental shapes (use warped coordinates)
    let largeScale = 0;
    largeScale += noise(wwx, wwy, 0.0003) * 1.0;
    largeScale += noise(wwx + 1000, wwy + 1000, 0.0006) * 0.5;
    largeScale = (largeScale - 0.75) * 0.7; // Much more water
    
    // MEDIUM SCALE: Regional terrain variation (use warped coordinates)
    let mediumScale = 0;
    let medAmp = 1.0;
    for (let i = 0; i < 8; i++) {
      const freq = 0.002 * Math.pow(2, i * 0.45);
      const offsetX = (i % 2 === 0 ? i * 100 : -i * 100);
      const offsetY = (i % 2 === 0 ? -i * 150 : i * 150);
      mediumScale += noise(wwx + offsetX, wwy + offsetY, freq) * medAmp;
      medAmp *= 0.55;
    }
    // Add prominent ridges for distinct coastline features
    const ridge1 = 1 - Math.abs(noise(wwx, wwy, 0.0025) * 2 - 1);
    const ridge2 = 1 - Math.abs(noise(wwx + 700, wwy + 700, 0.004) * 2 - 1);
    const ridge3 = 1 - Math.abs(noise(wwx - 400, wwy - 400, 0.006) * 2 - 1);
    mediumScale += ridge1 * 0.5 + ridge2 * 0.35 + ridge3 * 0.25;
    mediumScale = (mediumScale - 0.9) * 0.5; // Normalize
    
    // COASTLINE DETAIL: High-frequency noise for island complexity like reference
    let coastlineDetail = 0;
    let coastFreq = 0.008;
    let coastAmp = 0.4;
    for (let i = 0; i < 5; i++) {
      coastlineDetail += noise(x + i * 123, y + i * 321, coastFreq) * coastAmp;
      coastFreq *= 2.2;
      coastAmp *= 0.55;
    }
    coastlineDetail = coastlineDetail * 0.35; // Scale impact
    
    // SMALL SCALE: Subtle fine detail (6 octaves for texture, not noise)
    let smallScale = 0;
    let smallAmp = 1.0;
    for (let i = 0; i < 6; i++) {
      const freq = 0.012 * Math.pow(2, i * 0.5);
      const offsetX = (i % 3 === 0 ? i * 50 : (i % 3 === 1 ? -i * 50 : 0));
      const offsetY = (i % 3 === 0 ? -i * 50 : (i % 3 === 1 ? i * 50 : i * 25));
      smallScale += noise(x + offsetX, y + offsetY, freq) * smallAmp;
      smallAmp *= 0.6;
    }
    smallScale = (smallScale - 0.6) * 0.15; // Subtle impact
    
    // Rivers and straits - extensive water channels
    const river1 = Math.abs(noise(x + 300, y + 300, 0.0013) * 2 - 1);
    const river2 = Math.abs(noise(x - 300, y + 800, 0.0016) * 2 - 1);
    const river3 = Math.abs(noise(x + 800, y - 300, 0.0011) * 2 - 1);
    const river4 = Math.abs(noise(x - 600, y - 600, 0.0014) * 2 - 1);
    const river5 = Math.abs(noise(x + 1000, y + 500, 0.0015) * 2 - 1);
    const river6 = Math.abs(noise(x + 500, y - 700, 0.0012) * 2 - 1);
    const river7 = Math.abs(noise(x - 850, y + 350, 0.0017) * 2 - 1);
    const river8 = Math.abs(noise(x + 650, y + 650, 0.0010) * 2 - 1);
    let rivers = -(river1 * 0.24 + river2 * 0.20 + river3 * 0.20 + river4 * 0.18 + river5 * 0.18 + river6 * 0.16 + river7 * 0.14 + river8 * 0.14);
    
    // TRIBUTARY DETAIL: Dense river network like reference
    let tributaries = 0;
    let tribFreq = 0.004;
    let tribAmp = 0.15;
    for (let i = 0; i < 6; i++) {
      tributaries += Math.abs(noise(x + i * 234, y + i * 567, tribFreq) * 2 - 1) * tribAmp;
      tribFreq *= 1.8;
      tribAmp *= 0.65;
    }
    rivers -= tributaries;
    
    // Blend: large dominates, medium adds features, coastline adds complexity
    let combined = largeScale + mediumScale + coastlineDetail + smallScale + rivers;
    
    // THERMAL EROSION: Simulate rock weathering and talus slopes
    if (combined > 0.1) { // Only on higher land
      const talusAngle = 0.6; // Maximum stable slope
      const sampleDist = 8;
      const heightN = noise(wwx, wwy - sampleDist, 0.003);
      const heightS = noise(wwx, wwy + sampleDist, 0.003);
      const heightE = noise(wwx + sampleDist, wwy, 0.003);
      const heightW = noise(wwx - sampleDist, wwy, 0.003);
      
      const slopeX = Math.abs(heightE - heightW);
      const slopeY = Math.abs(heightN - heightS);
      const maxSlope = Math.max(slopeX, slopeY);
      
      if (maxSlope > talusAngle) {
        const weathering = (maxSlope - talusAngle) * 0.08;
        combined -= weathering;
      }
    }
    
    // STRATIFICATION: Add layered rock effect
    const stratificationNoise = noise(wwx, wwy, 0.008);
    const layers = Math.floor(combined * 8) / 8; // Create discrete elevation bands
    const stratEffect = (layers - combined) * 0.15 * stratificationNoise;
    combined += stratEffect;
    
    // Very strong edge fade to push water much deeper inward
    const fadeDistance = 500;
    const distToEdge = Math.min(x, y, worldSize - x, worldSize - y);
    if (distToEdge < fadeDistance) {
      const fadeFactor = distToEdge / fadeDistance;
      const smoothFade = fadeFactor * fadeFactor * (3 - 2 * fadeFactor);
      // Much stronger fade - force water at edges
      combined = combined * smoothFade - (1 - smoothFade) * 1.2;
    }
    
    return Math.max(-1, Math.min(1, combined));
  };
  
  // Generate MASSIVE number of territories - no network cost since bundled!
  const targetSeeds = 4000;
  let tries = 0;
  const maxTries = 100000;
  while (seeds.length < targetSeeds && tries < maxTries) {
    tries++;
    // Keep territories away from edges to prevent cutoff
    const margin = 100;
    const x = margin + random() * (worldSize - margin * 2);
    const y = margin + random() * (worldSize - margin * 2);
    const e = elevation(x, y);
    if (e < -0.15) continue;
    seeds.push({ x, y });
  }
  
  console.log(`Generated ${seeds.length} territory seeds`);
  
  // Build Voronoi polygons
  const buildVoronoiPolygon = (seedIdx: number) => {
    const center = seeds[seedIdx];
    const polygon: { x: number; y: number }[] = [];
    
    const samples = 128; // More samples = smoother, more detailed coastlines
    const maxRadius = 100; // Base territory size
    
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      let low = 0;
      let high = maxRadius;
      
      for (let iter = 0; iter < 15; iter++) { // More iterations = more precise boundaries
        const mid = (low + high) / 2;
        const testX = center.x + Math.cos(angle) * mid;
        const testY = center.y + Math.sin(angle) * mid;
        
        const e = elevation(testX, testY);
        if (e < -0.15) {
          high = mid;
          continue;
        }
        
        let closestIdx = seedIdx;
        let bestDist = Infinity;
        for (let j = 0; j < seeds.length; j++) {
          const dx = testX - seeds[j].x;
          const dy = testY - seeds[j].y;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) {
            bestDist = dist;
            closestIdx = j;
          }
        }
        
        if (closestIdx === seedIdx) {
          low = mid;
        } else {
          high = mid;
        }
      }
      
      // Hard clamp to world boundaries for clean edge cutoffs
      const boundaryX = Math.max(0, Math.min(worldSize, center.x + Math.cos(angle) * low));
      const boundaryY = Math.max(0, Math.min(worldSize, center.y + Math.sin(angle) * low));
      polygon.push({ x: boundaryX, y: boundaryY });
    }
    
    return polygon;
  };
  
  const territories = seeds.map((centroid, i) => {
    const e = elevation(centroid.x, centroid.y);
    
    let terrainType: 'highland' | 'plain' | 'lowland' | 'crater';
    if (e > 0.25) terrainType = 'highland';
    else if (e > -0.15) terrainType = 'plain';
    else if (e > -0.5) terrainType = 'lowland';
    else terrainType = 'crater';
    
    const polygon = buildVoronoiPolygon(i);
    
    // Validate polygon - filter out any NaN or Infinity values that could cause render errors
    const validPolygon = polygon.filter(p => 
      !isNaN(p.x) && !isNaN(p.y) && 
      isFinite(p.x) && isFinite(p.y)
    );
    
    return {
      id: `t-${i + 1}`,
      name: `Territory ${i + 1}`,
      centroid,
      polygon: validPolygon.length >= 3 ? validPolygon : polygon,
      terrainType,
      elevation: e
    };
  });
  
  return { territories, worldSize };
}

// Generate and save
const mapData = generateStaticMap();
const outputPath = path.join(__dirname, '../../client/src/assets/staticMap.json');
const outputDir = path.dirname(outputPath);

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(mapData, null, 2));
console.log(`✅ Static map saved to ${outputPath}`);
console.log(`   Territories: ${mapData.territories.length}`);
console.log(`   File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
