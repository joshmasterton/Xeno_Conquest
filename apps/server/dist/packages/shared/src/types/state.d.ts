export interface PlayerResources {
    gold: number;
    manpower: number;
}
export interface GameState {
    players: Record<string, PlayerResources>;
}
