import React from 'react';
import { useGameStore } from '../store/gameStore';
import { EVENTS } from '@xeno/shared';

export const GameHUD: React.FC = () => {
    const gold = useGameStore((s) => s.gold);
    const manpower = useGameStore((s) => s.manpower);
    const selectedNodeId = useGameStore((s) => s.selectedNodeId);
    const selectedUnitId = useGameStore((s) => s.selectedUnitId);
    const sendBuildOrder = useGameStore((s) => s.sendBuildOrder);
    const sendUpgradeOrder = useGameStore((s) => s.sendUpgradeOrder);
    const moveSplitPercent = useGameStore((s) => s.moveSplitPercent);
    const setMoveSplitPercent = useGameStore((s) => s.setMoveSplitPercent);
    const myPlayerId = useGameStore((s) => s.myPlayerId);
    const nodes = useGameStore((s) => s.nodes);
    
    // Get interaction mode to change button color/text
    const interactionMode = useGameStore((s) => s.interactionMode);
    const setInteractionMode = useGameStore((s) => s.setInteractionMode);

    const percentDisplay = Math.round(moveSplitPercent * 100);

    // Check Ownership
    const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;
    const isOwned = selectedNode?.ownerId === myPlayerId;
    const fortLevel = selectedNode?.fortificationLevel ?? 1;

    // ✅ Get Yields (Default to 0 if missing)
    const yieldGold = selectedNode?.resourceYield?.gold ?? 0;
    const yieldMp = selectedNode?.resourceYield?.manpower ?? 0;

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
            {/* Global Resources */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #444', pointerEvents: 'auto' }}>
                <span style={{ color: '#ffd700', fontWeight: 'bold' }}>💰 {gold}</span>
                <span style={{ color: '#00ccff', fontWeight: 'bold' }}>🛡️ {manpower} / 1000</span>
            </div>

            {/* PROVINCE INFO */}
            {selectedNode && (
                <div style={{ pointerEvents: 'auto', marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>
                        Province Info
                    </div>
                    
                    {/* ✅ YIELD DISPLAY */}
                    <div style={{ background: '#333', padding: '6px', borderRadius: '4px', marginBottom: '8px', fontSize: '12px', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Income:</span>
                        <span>
                            <span style={{ color: '#ffd700' }}>+{yieldGold}G</span>
                            <span style={{ color: '#666', margin: '0 4px' }}>|</span>
                            <span style={{ color: '#00ccff' }}>+{yieldMp}MP</span>
                            <span style={{ color: '#aaa', fontSize: '10px' }}> /sec</span>
                        </span>
                    </div>

                    {isOwned ? (
                        <>
                            {/* Fortification Status */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '13px' }}>
                                <span>🏰 Fort Lv {fortLevel}</span>
                                <span style={{ fontSize: '11px', color: '#4f4' }}>(-{Math.min(fortLevel * 10, 50)}% Dmg)</span>
                            </div>

                            <button
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    background: '#2d6cdf',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    marginBottom: '6px',
                                    fontWeight: 'bold'
                                }}
                                onClick={() => sendBuildOrder(selectedNode.id)}
                            >
                                Recruit (100G / 50MP)
                            </button>

                            <button
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    background: '#d97706',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                }}
                                onClick={() => sendUpgradeOrder(selectedNode.id)}
                            >
                                Upgrade Fort ({fortLevel * 100}G)
                            </button>
                        </>
                    ) : (
                        <div style={{ color: '#ff5555', fontStyle: 'italic', fontSize: '12px', textAlign: 'center', padding: '4px', border: '1px dashed #ff5555', borderRadius: '4px' }}>
                            Hostile Territory
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
