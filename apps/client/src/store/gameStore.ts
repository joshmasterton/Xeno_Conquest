import { create } from 'zustand';

export interface GameState {
	gold: number;
	manpower: number;
	myPlayerId: string;
	selectedNodeId: string | null;
	selectedUnitId: string | null;
	moveSplitPercent: number; // 0.0 to 1.0 (1.0 = Move All)
	setResources: (gold: number, manpower: number) => void;
	setPlayerId: (id: string) => void;
	setSelectedNodeId: (id: string | null) => void;
	setSelectedUnitId: (id: string | null) => void;
	setMoveSplitPercent: (p: number) => void;
	sendBuildOrder: (nodeId: string) => void;
}

export const useGameStore = create<GameState>((set) => ({
	gold: 0,
	manpower: 0,
	myPlayerId: 'player-1',
	selectedNodeId: null,
	selectedUnitId: null,
	moveSplitPercent: 1.0,
	setResources: (gold: number, manpower: number) => set({ gold, manpower }),
	setPlayerId: (id: string) => set({ myPlayerId: id }),
	setSelectedNodeId: (id: string | null) => set({ selectedNodeId: id }),
	setSelectedUnitId: (id: string | null) => set({ selectedUnitId: id }),
	setMoveSplitPercent: (p: number) => set({ moveSplitPercent: p }),
	sendBuildOrder: () => undefined,
}));
