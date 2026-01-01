// This snippet adds spawnCorpse method to EffectSystem
// Add this method before the closing brace of EffectSystem class:

spawnCorpse(x: number, y: number, rotation: number, color: number) {
    const corpse = new Container();
    corpse.position.set(x, y);
    corpse.rotation = rotation;
    
    // Body (darkened soldier color)
    const bodyColor = Math.floor(
      ((color >> 16) * 0.6) << 16 |
      (((color >> 8) & 0xFF) * 0.6) << 8 |
      ((color & 0xFF) * 0.6)
    );
    
    const body = new Graphics();
    body.beginFill(bodyColor);
    body.drawRoundedRect(-0.6, -0.4, 1.2, 0.8, 0.2);
    body.endFill();
    corpse.addChild(body);
    
    // Head
    const head = new Graphics();
    head.beginFill(color);
    head.drawCircle(0, -0.6, 0.4);
    head.endFill();
    corpse.addChild(head);
    
    // Blood pool (underneath)
    const bloodPool = new Graphics();
    bloodPool.beginFill(0x660000, 0.4);
    bloodPool.drawEllipse(0, 0.5, 0.8, 0.3);
    bloodPool.endFill();
    bloodPool.position.y = 0.8;
    corpse.addChild(bloodPool);
    
    this.decalContainer.addChild(corpse);
}
