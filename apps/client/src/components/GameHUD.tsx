import React from 'react';
import { useGameStore } from '../store/gameStore';
import { EVENTS } from '@xeno/shared';

export const GameHUD: React.FC = () => {
    const gold = useGameStore((s) => s.gold);
    const manpower = useGameStore((s) => s.manpower);
    const selectedNodeId = useGameStore((s) => s.selectedNodeId);
    const selectedUnitId = useGameStore((s) => s.selectedUnitId);
    const sendBuildOrder = useGameStore((s) => s.sendBuildOrder);
    const moveSplitPercent = useGameStore((s) => s.moveSplitPercent);
    const setMoveSplitPercent = useGameStore((s) => s.setMoveSplitPercent);
    const myPlayerId = useGameStore((s) => s.myPlayerId);
    const nodes = useGameStore((s) => s.nodes);
    
    // Get interaction mode to change button color/text
    const interactionMode = useGameStore((s) => s.interactionMode);
    const setInteractionMode = useGameStore((s) => s.setInteractionMode);

    const percentDisplay = Math.round(moveSplitPercent * 100);

    // Get socket for upgrade orders
    const socket = useGameStore((s) => s.socket);

    const sendUpgradeOrder = (nodeId: string) => {
        if (socket) {
            socket.emit(EVENTS.C_UPGRADE_NODE, { nodeId });
        }
    };

    // Check Ownership
    const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;
    const isOwned = selectedNode?.ownerId === myPlayerId;

    return (
        <div
            style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: 'rgba(0, 0, 0, 0.8)',
                color: '#ffffff',
                padding: '12px',
                borderRadius: '8px',
                fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif',
                fontSize: '14px',
                width: '200px',
                pointerEvents: 'none', // Allow clicking through empty space
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}
        >
            {/* Resources */}
            <div style={{ marginBottom: '12px', pointerEvents: 'auto' }}>
                <div style={{ color: '#ffd700', fontWeight: 'bold' }}>Gold: {gold}</div>
                <div style={{ color: '#00ccff', fontWeight: 'bold' }}>Manpower: {manpower}</div>
            </div>

            {/* PROVINCE SELECTED UI */}
            {selectedNodeId && (
                <div style={{ pointerEvents: 'auto', borderTop: '1px solid #444', paddingTop: '8px' }}>
                    {isOwned ? (
                        <>
                            <div style={{ marginBottom: '8px', color: '#0f0', fontSize: '12px' }}>Owned Province</div>
                            <button
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    background: '#2d6cdf',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    marginBottom: '8px'
                                }}
                                onClick={() => sendBuildOrder(selectedNodeId)}
                            >
                                Recruit Unit (50 Gold)
                            </button>
                            <button
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    background: '#d97706',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                }}
                                onClick={() => sendUpgradeOrder(selectedNodeId)}
                            >
                                Upgrade Fort (100G)
                            </button>
                        </>
                    ) : (
                        <div style={{ fontSize: '12px', color: '#f00' }}>
                            Enemy / Neutral Province
                        </div>
                    )}
                </div>
            )}

            {/* UNIT SELECTED UI */}
            {selectedUnitId && (
                <div style={{ pointerEvents: 'auto', borderTop: '1px solid #444', paddingTop: '8px' }}>
                    
                    {/* Unit Header */}
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>Selected Unit</div>
                        <div style={{ fontWeight: 'bold', color: '#fff', wordBreak: 'break-all' }}>
                            {selectedUnitId}
                        </div>
                    </div>

                    {/* --- THE MISSING MOVE BUTTON --- */}
                    <button
                        style={{
                            width: '100%',
                            marginBottom: '12px',
                            padding: '10px',
                            background: interactionMode === 'TARGETING' ? '#ff4444' : '#44cc44', // Red (Cancel) or Green (Move)
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            textTransform: 'uppercase',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                        }}
                        onClick={() => {
                            if (interactionMode === 'TARGETING') {
                                setInteractionMode('SELECT');
                            } else {
                                setInteractionMode('TARGETING');
                            }
                        }}
                    >
                        {interactionMode === 'TARGETING' ? 'Cancel Targeting' : 'Move / Attack'}
                    </button>
                    {/* ------------------------------- */}

                    {/* Split Slider */}
                    <div style={{ background: '#333', padding: '8px', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
                            <span>Amount:</span>
                            <span style={{ color: '#44cc44', fontWeight: 'bold' }}>
                                {percentDisplay === 100 ? 'ALL' : `${percentDisplay}%`}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.1"
                            value={moveSplitPercent}
                            onChange={(e) => setMoveSplitPercent(parseFloat(e.target.value))}
                            style={{ width: '100%', cursor: 'pointer', display: 'block' }}
                        />
                         <div style={{ fontSize: '10px', color: '#aaa', marginTop: '4px', textAlign: 'center' }}>
                            Drag to split army
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
