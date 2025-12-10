import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

interface Territory {
  id: number;
  name: string;
  centroid: { x: number; y: number };
  polygon: { x: number; y: number }[];
}

async function compareWithMask() {
  console.log('=== Territory Comparison Tool ===\n');

  // Load the color mask
  const maskPath = path.join(__dirname, '../assets/Territories_Out.png');
  const maskImage = sharp(maskPath);
  const maskMeta = await maskImage.metadata();
  const { data: maskData, info } = await maskImage.raw().toBuffer({ resolveWithObject: true });

  console.log(`Loaded mask: ${info.width}×${info.height}\n`);

  // Load generated territories
  const territoriesPath = path.join(__dirname, '../../client/src/assets/staticMap.json');
  const territoriesData = JSON.parse(fs.readFileSync(territoriesPath, 'utf-8'));
  const territories: Territory[] = territoriesData.territories || territoriesData;

  console.log(`Loaded ${territories.length} generated territories\n`);

  // Analyze color coverage
  const colorCounts = new Map<string, number>();
  const totalPixels = info.width * info.height;
  let waterPixels = 0;

  for (let i = 0; i < maskData.length; i += 3) {
    const r = maskData[i];
    const g = maskData[i + 1];
    const b = maskData[i + 2];

    if (r === 0 && g === 0 && b === 0) {
      waterPixels++;
      continue;
    }

    const colorKey = `${r},${g},${b}`;
    colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + 1);
  }

  const landPixels = totalPixels - waterPixels;
  console.log(`Mask Analysis:`);
  console.log(`  Total pixels: ${totalPixels.toLocaleString()}`);
  console.log(`  Water (black): ${waterPixels.toLocaleString()} (${((waterPixels / totalPixels) * 100).toFixed(2)}%)`);
  console.log(`  Land (colored): ${landPixels.toLocaleString()} (${((landPixels / totalPixels) * 100).toFixed(2)}%)`);
  console.log(`  Unique colors: ${colorCounts.size}\n`);

  // Create a visualization showing:
  // 1. Original mask
  // 2. Generated territories overlay
  // 3. Difference map

  const width = info.width;
  const height = info.height;

  // Create buffer to mark which pixels are covered by territories
  const covered = new Uint8Array(width * height);

  // Mark pixels covered by generated territories
  for (const territory of territories) {
    // Convert world coordinates back to pixel coordinates
    for (const point of territory.polygon) {
      const px = Math.floor((point.x / 2500) * width);
      const py = Math.floor((point.y / 2500) * height);
      
      if (px >= 0 && px < width && py >= 0 && py < height) {
        covered[py * width + px] = 1;
      }
    }

    // Fill polygon using scanline algorithm
    const points = territory.polygon.map(p => ({
      x: Math.floor((p.x / 2500) * width),
      y: Math.floor((p.y / 2500) * height)
    }));

    // Simple polygon fill
    const minY = Math.max(0, Math.min(...points.map(p => p.y)));
    const maxY = Math.min(height - 1, Math.max(...points.map(p => p.y)));

    for (let y = minY; y <= maxY; y++) {
      const intersections: number[] = [];
      
      for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        
        if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
          const x = p1.x + ((y - p1.y) / (p2.y - p1.y)) * (p2.x - p1.x);
          intersections.push(Math.floor(x));
        }
      }
      
      intersections.sort((a, b) => a - b);
      
      for (let i = 0; i < intersections.length - 1; i += 2) {
        const x1 = Math.max(0, intersections[i]);
        const x2 = Math.min(width - 1, intersections[i + 1]);
        
        for (let x = x1; x <= x2; x++) {
          covered[y * width + x] = 1;
        }
      }
    }
  }

  // Count covered vs uncovered land pixels
  let coveredLandPixels = 0;
  let uncoveredLandPixels = 0;

  for (let i = 0; i < maskData.length / 3; i++) {
    const r = maskData[i * 3];
    const g = maskData[i * 3 + 1];
    const b = maskData[i * 3 + 2];

    // Skip water
    if (r === 0 && g === 0 && b === 0) continue;

    if (covered[i]) {
      coveredLandPixels++;
    } else {
      uncoveredLandPixels++;
    }
  }

  console.log(`Coverage Analysis:`);
  console.log(`  Land pixels covered: ${coveredLandPixels.toLocaleString()} (${((coveredLandPixels / landPixels) * 100).toFixed(2)}%)`);
  console.log(`  Land pixels uncovered: ${uncoveredLandPixels.toLocaleString()} (${((uncoveredLandPixels / landPixels) * 100).toFixed(2)}%)`);

  // Create difference visualization
  const diffBuffer = Buffer.alloc(width * height * 3);

  for (let i = 0; i < width * height; i++) {
    const r = maskData[i * 3];
    const g = maskData[i * 3 + 1];
    const b = maskData[i * 3 + 2];

    if (r === 0 && g === 0 && b === 0) {
      // Water - blue
      diffBuffer[i * 3] = 0;
      diffBuffer[i * 3 + 1] = 100;
      diffBuffer[i * 3 + 2] = 200;
    } else if (covered[i]) {
      // Covered land - green
      diffBuffer[i * 3] = 0;
      diffBuffer[i * 3 + 1] = 200;
      diffBuffer[i * 3 + 2] = 0;
    } else {
      // Uncovered land - red (this is the problem area)
      diffBuffer[i * 3] = 255;
      diffBuffer[i * 3 + 1] = 0;
      diffBuffer[i * 3 + 2] = 0;
    }
  }

  const outputPath = path.join(__dirname, '../assets/territory_coverage_analysis.png');
  await sharp(diffBuffer, {
    raw: {
      width,
      height,
      channels: 3
    }
  }).png().toFile(outputPath);

  console.log(`\n✅ Analysis complete!`);
  console.log(`📁 Coverage map saved to: ${outputPath}`);
  console.log(`\nColor legend:`);
  console.log(`  🔵 Blue = Water`);
  console.log(`  🟢 Green = Land covered by territories`);
  console.log(`  🔴 Red = Land NOT covered (missing territories)`);
}

compareWithMask().catch(console.error);
