#!/usr/bin/env ts-node
import sharp from 'sharp';
import * as path from 'path';

async function inspectAssets() {
  const assets = [
    'water_mask_Out.png',
    'Territories_Out.png',
    'colour_Out.png',
    'Height_Out.exr'
  ];

  for (const asset of assets) {
    const filepath = path.join(__dirname, '../assets', asset);
    try {
      const metadata = await sharp(filepath).metadata();
      console.log(`\n${asset}:`);
      console.log(`  Dimensions: ${metadata.width}×${metadata.height}`);
      console.log(`  Channels: ${metadata.channels}`);
      console.log(`  Depth: ${metadata.depth}`);
      console.log(`  Format: ${metadata.format}`);
      console.log(`  Space: ${metadata.space}`);
    } catch (err) {
      console.log(`\n${asset}: ERROR - ${err}`);
    }
  }
}

inspectAssets().catch(console.error);
