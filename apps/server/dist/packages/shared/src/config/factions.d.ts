export interface Faction {
    id: string;
    color: number;
    name: string;
    type: 'HUMAN' | 'AI' | 'NEUTRAL';
}
export declare const FACTION_PALETTE: number[];
export declare function getFactionColor(ownerId: string | null | undefined): number;
