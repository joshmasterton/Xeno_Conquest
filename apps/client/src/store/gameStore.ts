import { create } from 'zustand';

export interface GameState {
	gold: number;
	manpower: number;
	myPlayerId: string;
	selectedNodeId: string | null;
	setResources: (gold: number, manpower: number) => void;
	setPlayerId: (id: string) => void;
	setSelectedNodeId: (id: string | null) => void;
	sendBuildOrder: (nodeId: string) => void;
}

export const useGameStore = create<GameState>((set) => ({
	gold: 0,
	manpower: 0,
	myPlayerId: 'player-1',
	selectedNodeId: null,
	setResources: (gold: number, manpower: number) => set({ gold, manpower }),
	setPlayerId: (id: string) => set({ myPlayerId: id }),
	setSelectedNodeId: (id: string | null) => set({ selectedNodeId: id }),
	sendBuildOrder: () => undefined,
}));
