import sharp from 'sharp';
import path from 'path';

async function analyzeGaps() {
  console.log('=== Gap Analysis ===\n');

  // Load masks
  const waterMaskPath = path.join(__dirname, '../assets/water_mask_Out.png');
  const territoryMaskPath = path.join(__dirname, '../assets/Territories_Out.png');

  const waterMask = await sharp(waterMaskPath).raw().toBuffer({ resolveWithObject: true });
  const territoryMask = await sharp(territoryMaskPath).raw().toBuffer({ resolveWithObject: true });

  const width = territoryMask.info.width;
  const height = territoryMask.info.height;

  // Find small disconnected regions that might be filtered out
  const minSizeThreshold = 100; // Current minimum in our algorithm

  console.log(`Analyzing regions smaller than ${minSizeThreshold} pixels...\n`);

  const visited = new Uint8Array(width * height);
  const smallRegions: Array<{ color: string; size: number; pixels: number[] }> = [];

  const getRGB = (data: Buffer, idx: number) => ({
    r: data[idx * 3],
    g: data[idx * 3 + 1],
    b: data[idx * 3 + 2]
  });

  // Flood-fill to find all regions
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx]) continue;

      const waterValue = waterMask.data[idx];
      const { r, g, b } = getRGB(territoryMask.data, idx);

      // Skip water
      if (waterValue > 127 || (r === 0 && g === 0 && b === 0)) {
        visited[idx] = 1;
        continue;
      }

      // Flood-fill this region
      const pixels: number[] = [];
      const queue = [idx];
      visited[idx] = 1;

      while (queue.length > 0) {
        const current = queue.shift()!;
        pixels.push(current);

        const cx = current % width;
        const cy = Math.floor(current / width);

        // 4-connected neighbors
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
          const nRGB = getRGB(territoryMask.data, nidx);

          // Skip water
          if (nWater > 127 || (nRGB.r === 0 && nRGB.g === 0 && nRGB.b === 0)) {
            visited[nidx] = 1;
            continue;
          }

          // Check if same color (with threshold)
          const colorDist = Math.sqrt(
            (r - nRGB.r) ** 2 + (g - nRGB.g) ** 2 + (b - nRGB.b) ** 2
          );

          if (colorDist <= 70) {
            visited[nidx] = 1;
            queue.push(nidx);
          } else {
            visited[nidx] = 1;
          }
        }
      }

      // Track small regions
      if (pixels.length > 0 && pixels.length <= minSizeThreshold) {
        smallRegions.push({
          color: `RGB(${r},${g},${b})`,
          size: pixels.length,
          pixels
        });
      }
    }

    if (y % 409 === 0) {
      process.stdout.write(`\rProgress: ${Math.floor((y / height) * 100)}%`);
    }
  }

  console.log(`\n\n✓ Found ${smallRegions.length} regions smaller than ${minSizeThreshold} pixels\n`);

  // Sort by size
  smallRegions.sort((a, b) => b.size - a.size);

  // Show top 30
  console.log('Top 30 smallest filtered regions:');
  for (let i = 0; i < Math.min(30, smallRegions.length); i++) {
    const region = smallRegions[i];
    console.log(`  ${i + 1}. ${region.color} - ${region.size} pixels`);
  }

  const totalGapPixels = smallRegions.reduce((sum, r) => sum + r.size, 0);
  console.log(`\nTotal pixels in filtered small regions: ${totalGapPixels.toLocaleString()}`);

  // Suggest threshold adjustment
  console.log(`\n💡 Suggestions:`);
  if (totalGapPixels > 10000) {
    console.log(`  - Lower minimum size threshold from 100 to 50 or 25 pixels`);
  }
  console.log(`  - Current coverage: 99.20% (0.80% gaps)`);
  console.log(`  - Small islands account for ~${((totalGapPixels / 4946797) * 100).toFixed(2)}% of gaps`);
}

analyzeGaps().catch(console.error);
