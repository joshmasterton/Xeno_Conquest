import { create } from 'zustand';
import type { RoadNode } from '@xeno/shared';

// Define the Mode Type
export type InteractionMode = 'SELECT' | 'TARGETING';

export interface GameState {
	gold: number;
	manpower: number;
	myPlayerId: string;
	selectedNodeId: string | null;
	selectedUnitId: string | null;
	moveSplitPercent: number; // 0.0 to 1.0 (1.0 = Move All)
	interactionMode: InteractionMode;
	nodes: RoadNode[]; // Store the list of nodes
	setResources: (gold: number, manpower: number) => void;
	setPlayerId: (id: string) => void;
	setSelectedNodeId: (id: string | null) => void;
	setSelectedUnitId: (id: string | null) => void;
	setMoveSplitPercent: (p: number) => void;
	setInteractionMode: (mode: InteractionMode) => void;
	sendBuildOrder: (nodeId: string) => void;
	setNodes: (nodes: RoadNode[]) => void;
	sendUpgradeOrder: (nodeId: string) => void;
}

export const useGameStore = create<GameState>((set) => ({
	gold: 0,
	manpower: 0,
	myPlayerId: 'player-1',
	selectedNodeId: null,
	selectedUnitId: null,
	moveSplitPercent: 1.0,
	interactionMode: 'SELECT',
	nodes: [],
	setResources: (gold: number, manpower: number) => set({ gold, manpower }),
	setPlayerId: (id: string) => set({ myPlayerId: id }),
	setSelectedNodeId: (id: string | null) => set({ selectedNodeId: id }),
	setSelectedUnitId: (id: string | null) => set({ selectedUnitId: id }),
	setMoveSplitPercent: (p: number) => set({ moveSplitPercent: p }),
	setInteractionMode: (mode: InteractionMode) => set({ interactionMode: mode }),
	sendBuildOrder: () => undefined,
	setNodes: (nodes: RoadNode[]) => set({ nodes }),
	sendUpgradeOrder: () => undefined,
}));
