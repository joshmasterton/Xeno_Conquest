import fs from 'fs/promises';
import path from 'path';
import type { Unit, RoadNode, PlayerResources } from '@xeno/shared';

const SAVE_FILE = 'savegame.json';

export interface PersistedState {
  timestamp: number;
  units: Unit[];
  nodes: RoadNode[];
  players: [string, PlayerResources][]; // Store Map as array of entries
}

export class StateManager {
  private filePath: string;

  constructor() {
    // Save in the server root directory
    this.filePath = path.resolve(process.cwd(), SAVE_FILE);
  }

  async save(
    units: Unit[],
    nodes: RoadNode[],
    playerStates: Map<string, PlayerResources>
  ): Promise<void> {
    const state: PersistedState = {
      timestamp: Date.now(),
      units,
      nodes,
      players: Array.from(playerStates.entries()),
    };

    try {
      // atomic write (write to temp then rename) to prevent corruption
      const tempPath = `${this.filePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf-8');
      await fs.rename(tempPath, this.filePath);
      console.log(`💾 Game saved to ${SAVE_FILE}`);
    } catch (err) {
      console.error('❌ Failed to save game state:', err);
    }
  }

  async load(): Promise<PersistedState | null> {
    try {
      await fs.access(this.filePath); // Check if exists
      const data = await fs.readFile(this.filePath, 'utf-8');
      const state = JSON.parse(data) as PersistedState;
      console.log(`📂 Game loaded from ${SAVE_FILE} (${state.units.length} units)`);
      return state;
    } catch (err) {
      console.log('✨ No save file found. Starting new game.');
      return null;
    }
  }
}
