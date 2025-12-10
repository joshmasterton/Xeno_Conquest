import { create } from 'zustand';
import { Point } from '@xeno/shared/types';

interface UnitState {
  id: string;
  position: Point;
  ownerId: string;
  isMoving: boolean;
}

interface UnitStore {
  units: Map<string, UnitState>;
  addUnit: (id: string, position: Point, ownerId: string) => void;
  updatePosition: (id: string, position: Point) => void;
  getUnit: (id: string) => UnitState | undefined;
  setMoving: (id: string, isMoving: boolean) => void;
}

export const useUnitStore = create<UnitStore>((set, get) => ({
  units: new Map(),
  
  addUnit: (id, position, ownerId) => {
    set((state) => {
      const newUnits = new Map(state.units);
      newUnits.set(id, { id, position, ownerId, isMoving: false });
      return { units: newUnits };
    });
  },
  
  updatePosition: (id, position) => {
    set((state) => {
      const newUnits = new Map(state.units);
      const unit = newUnits.get(id);
      if (unit) {
        newUnits.set(id, { ...unit, position });
      }
      return { units: newUnits };
    });
  },
  
  getUnit: (id) => get().units.get(id),
  
  setMoving: (id, isMoving) => {
    set((state) => {
      const newUnits = new Map(state.units);
      const unit = newUnits.get(id);
      if (unit) {
        newUnits.set(id, { ...unit, isMoving });
      }
      return { units: newUnits };
    });
  },
}));
