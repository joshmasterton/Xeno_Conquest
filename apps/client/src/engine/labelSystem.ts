import { Container, Text, TextStyle, Graphics } from 'pixi.js';
import type { RoadNode } from '@xeno/shared';

export interface LabelSystem {
  container: Container;
  // Resource labels (nodeId -> Text)
  labels: Map<string, Text>;
  // Unit count labels (unitId -> Text)
  unitLabels: Map<string, Text>;
  targetsY: Map<string, number>;
  style: TextStyle;
}

export function createLabelSystem(): LabelSystem {
  return {
    container: new Container(),
    labels: new Map<string, Text>(),
    unitLabels: new Map<string, Text>(),
    targetsY: new Map<string, number>(),
    style: new TextStyle({
      fontFamily: 'Arial',
      fontSize: 36,
      fill: '#ffffff',
      fontWeight: '900',
      stroke: '#000000',
      strokeThickness: 6,
      align: 'center',
      dropShadow: true,
      dropShadowDistance: 2,
      dropShadowBlur: 2,
    }),
  };
}

export function syncYieldLabels(system: LabelSystem, nodes: RoadNode[]): void {
  for (const node of nodes) {
    if (!node.resourceYield) continue;
    const gold = node.resourceYield.gold ?? 0;
    const mp = node.resourceYield.manpower ?? 0;
    if (gold === 0 && mp === 0) continue;
    const textContent = `${gold}G ${mp}MP`;

    let label = system.labels.get(node.id);
    if (!label) {
      label = new Text(textContent, system.style);
      label.anchor.set(0.5, 0.5);
      label.scale.set(0.33);
      label.resolution = 2;
      label.position.set(node.x, node.y - 20);
      system.container.addChild(label);
      system.labels.set(node.id, label);
      system.targetsY.set(node.id, node.y - 20);
    } else if (label.text !== textContent) {
      label.text = textContent;
    }
  }
}

export function syncUnitLabels(system: LabelSystem, unitSprites: Map<string, any>): void {
  // 1. Create/Update labels for existing units
  for (const [id, sprite] of unitSprites) {
    const count = sprite.serverUnit?.count ?? 0;
    const textContent = `${count}`;
    
    let label = system.unitLabels.get(id);
    if (!label) {
      label = new Text(textContent, system.style);
      label.anchor.set(0.5, 0.5);
      label.scale.set(0.33); // Initial scale
      label.resolution = 2;
      label.position.set(sprite.x, sprite.y - 25);
      system.container.addChild(label);
      system.unitLabels.set(id, label);
    } else {
      if (label.text !== textContent) label.text = textContent;
      // Keep X synced immediately, Y is animated later
      label.x = sprite.x;
    }
  }

  // 2. Cleanup labels for dead units
  for (const [id, label] of system.unitLabels) {
    if (!unitSprites.has(id)) {
      system.container.removeChild(label);
      label.destroy();
      system.unitLabels.delete(id);
      system.targetsY.delete(`unit-${id}`); // cleanup target
    }
  }
}

export function updateLabelTargets(system: LabelSystem, nodes: RoadNode[], unitSprites: Map<string, Graphics>, zoom: number, unitLabelOffset?: number): void {
  const safeZoom = Math.max(zoom, 0.05);
  const labelScale = 0.33 / safeZoom;

  // Constants for spacing
  const unitBaseOffset = 16 + 4 / safeZoom;
  const stackGap = 14 / safeZoom; // Gap between stacked unit labels
  const resourceGap = 12 / safeZoom; // Gap between top unit and resource label

  // --- 1. Calculate Unit Stacking ---
  const unitGroups: Map<string, string[]> = new Map(); // "x,y" key -> [unitId, unitId]

  for (const [id, sprite] of unitSprites) {
    // Quantize position to detect overlap (snap to ~5 pixels)
    const kx = Math.round(sprite.x / 5);
    const ky = Math.round(sprite.y / 5);
    const key = `${kx},${ky}`;
    
    if (!unitGroups.has(key)) unitGroups.set(key, []);
    unitGroups.get(key)!.push(id);
  }

  // Assign Y targets for units based on their stack index
  const occupiedNodes = new Set<string>();

  for (const group of unitGroups.values()) {
    // Sort for stable ordering
    group.sort();

    for (let i = 0; i < group.length; i++) {
      const unitId = group[i];
      const sprite = unitSprites.get(unitId);
      if (!sprite) continue;

      // Base offset + (index * gap)
      const stackOffset = unitBaseOffset + (i * stackGap);
      const targetY = sprite.y - stackOffset;

      // Store specific target for this unit label
      system.targetsY.set(`unit-${unitId}`, targetY);
      
      // Update label scale
      const label = system.unitLabels.get(unitId);
      if (label) label.scale.set(labelScale);

      // Check if this unit is near a node to mark it occupied
      for (const node of nodes) {
        const dx = sprite.x - node.x;
        const dy = sprite.y - node.y;
        if (dx * dx + dy * dy < 400) occupiedNodes.add(node.id);
      }
    }
  }

  // --- 2. Calculate Resource Label Positions ---
  for (const node of nodes) {
    if (!system.labels.has(node.id)) continue;
    const isOccupied = occupiedNodes.has(node.id);

    // Find the "highest" unit label at this node location to stack on top of
    let maxUnitOffset = unitBaseOffset;
    if (isOccupied) {
      // Find how many units are at this node's location
      const kx = Math.round(node.x / 5);
      const ky = Math.round(node.y / 5);
      const key = `${kx},${ky}`;
      const group = unitGroups.get(key);
      if (group) {
        maxUnitOffset = unitBaseOffset + (group.length * stackGap); // Place above the stack
      }
    }

    const offset = isOccupied
      ? maxUnitOffset + resourceGap
      : 8 + 10 / safeZoom;

    system.targetsY.set(node.id, node.y - offset);
    
    const label = system.labels.get(node.id);
    if (label) label.scale.set(labelScale);
  }
}

export function animateLabels(system: LabelSystem): void {
  const SMOOTHING = 0.2;
  
  // Animate Resource Labels
  for (const [id, label] of system.labels) {
    const targetY = system.targetsY.get(id);
    if (targetY === undefined) continue;
    const diff = targetY - label.y;
    if (Math.abs(diff) < 0.5) label.y = targetY;
    else label.y += diff * SMOOTHING;
  }

  // Animate Unit Labels
  for (const [id, label] of system.unitLabels) {
    const targetY = system.targetsY.get(`unit-${id}`);
    if (targetY === undefined) continue;
    const diff = targetY - label.y;
    if (Math.abs(diff) < 0.5) label.y = targetY;
    else label.y += diff * SMOOTHING;
  }
}

export function destroyLabelSystem(system: LabelSystem): void {
  system.container.destroy({ children: true });
  system.labels.clear();
  system.unitLabels.clear();
  system.targetsY.clear();
}
