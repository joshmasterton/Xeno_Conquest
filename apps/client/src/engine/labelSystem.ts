import { Container, Text, TextStyle, Graphics } from 'pixi.js';
import type { RoadNode } from '@xeno/shared';

export interface LabelSystem {
  container: Container;
  labels: Map<string, Text>;
  targetsY: Map<string, number>;
  style: TextStyle;
}

export function createLabelSystem(): LabelSystem {
  return {
    container: new Container(),
    labels: new Map<string, Text>(),
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

export function updateLabelTargets(system: LabelSystem, nodes: RoadNode[], unitSprites: Map<string, Graphics>, zoom: number, unitLabelOffset: number): void {
  const safeZoom = Math.max(zoom, 0.2);
  const occupied = new Set<string>();
  for (const sprite of unitSprites.values()) {
    for (const node of nodes) {
      const dx = sprite.x - node.x;
      const dy = sprite.y - node.y;
      if (dx * dx + dy * dy < 400) occupied.add(node.id);
    }
  }

  const screenGapPx = 35; // desired on-screen gap between unit and resource labels
  const emptyWorldBase = 8; // minimal clearance above node when unoccupied
  const emptyScreenPadPx = 20; // keep readable even when zoomed in

  for (const node of nodes) {
    if (!system.labels.has(node.id)) continue;
    const isOccupied = occupied.has(node.id);

    const offset = isOccupied
      ? unitLabelOffset + screenGapPx / safeZoom
      : emptyWorldBase + emptyScreenPadPx / safeZoom;

    system.targetsY.set(node.id, node.y - offset);
  }
}

export function animateLabels(system: LabelSystem): void {
  const SMOOTHING = 0.2;
  for (const [id, label] of system.labels) {
    const targetY = system.targetsY.get(id);
    if (targetY === undefined) continue;
    const diff = targetY - label.y;
    if (Math.abs(diff) < 0.5) {
      label.y = targetY;
    } else {
      label.y += diff * SMOOTHING;
    }
  }
}

export function destroyLabelSystem(system: LabelSystem): void {
  system.container.destroy({ children: true });
  system.labels.clear();
  system.targetsY.clear();
}
