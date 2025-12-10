const sharp = require('sharp');

sharp('assets/Territories_Out.png')
  .raw()
  .toBuffer({ resolveWithObject: true })
  .then(({ data, info }) => {
    const colors = new Map();
    
    // Read RGB values (data has R,G,B,R,G,B,... for each pixel)
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const colorKey = `${r},${g},${b}`;
      colors.set(colorKey, (colors.get(colorKey) || 0) + 1);
    }
    
    const sorted = [...colors.entries()].sort((a, b) => b[1] - a[1]);
    
    console.log('=== Territory Mask Analysis (RGB) ===\n');
    console.log(`Image size: ${info.width}x${info.height}`);
    console.log(`Total unique RGB colors: ${colors.size}\n`);
    
    console.log('Top 30 colors by pixel count:');
    sorted.slice(0, 30).forEach(([color, count]) => {
      const pct = ((count / (info.width * info.height)) * 100).toFixed(2);
      const [r, g, b] = color.split(',').map(Number);
      console.log(`  RGB(${r.toString().padStart(3)}, ${g.toString().padStart(3)}, ${b.toString().padStart(3)}): ${count.toLocaleString().padStart(10)} pixels (${pct}%)`);
    });
    
    // Check for black (water)
    const blackCount = colors.get('0,0,0') || 0;
    const landPixels = (info.width * info.height) - blackCount;
    console.log(`\n=== Summary ===`);
    console.log(`Black (0,0,0) water: ${blackCount.toLocaleString()} pixels (${((blackCount/(info.width*info.height))*100).toFixed(2)}%)`);
    console.log(`Land colors: ${colors.size - (blackCount > 0 ? 1 : 0)} unique colors`);
    console.log(`Land pixels: ${landPixels.toLocaleString()} pixels (${((landPixels/(info.width*info.height))*100).toFixed(2)}%)`);
  });
