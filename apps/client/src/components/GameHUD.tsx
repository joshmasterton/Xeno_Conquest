import React from 'react';
import { useGameStore } from '../store/gameStore';

export const GameHUD: React.FC = () => {
	const gold = useGameStore((s) => s.gold);
	const manpower = useGameStore((s) => s.manpower);
	const selectedNodeId = useGameStore((s) => s.selectedNodeId);
	const selectedUnitId = useGameStore((s) => s.selectedUnitId);
	const sendBuildOrder = useGameStore((s) => s.sendBuildOrder);
	const moveSplitPercent = useGameStore((s) => s.moveSplitPercent);
	const setMoveSplitPercent = useGameStore((s) => s.setMoveSplitPercent);

	const percentDisplay = Math.round(moveSplitPercent * 100);

	return (
		<div
			style={{
				position: 'absolute',
				top: '10px',
				right: '10px',
				background: 'rgba(0, 0, 0, 0.7)',
				color: '#ffffff',
				padding: '8px 12px',
				borderRadius: '6px',
				fontFamily: 'sans-serif',
				fontSize: '14px',
				pointerEvents: 'none',
				boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
			}}
		>
			<div>Gold: {gold}</div>
			<div>Manpower: {manpower}</div>
			{selectedNodeId && (
				<button
					style={{
						marginTop: '8px',
						padding: '6px 10px',
						background: '#2d6cdf',
						color: '#fff',
						border: 'none',
						borderRadius: '4px',
						cursor: 'pointer',
						pointerEvents: 'auto',
					}}
					onClick={() => sendBuildOrder(selectedNodeId)}
				>
					Build Unit (50 Gold)
				</button>
			)}

			{selectedUnitId && (
				<div
					style={{
						marginTop: '8px',
						background: '#333',
						padding: '8px',
						borderRadius: '4px',
						pointerEvents: 'auto',
					}}
				>
					<div style={{ marginBottom: '4px', fontSize: '12px' }}>
						Orders: {percentDisplay === 100 ? 'Move All' : `Split ${percentDisplay}%`}
					</div>
					<input
						type="range"
						min="0.1"
						max="1.0"
						step="0.1"
						value={moveSplitPercent}
						onChange={(e) => setMoveSplitPercent(parseFloat(e.target.value))}
						style={{ width: '100%', cursor: 'pointer' }}
					/>
					<div style={{ fontSize: '10px', color: '#aaa', marginTop: '2px' }}>
						Drag to split army
					</div>
				</div>
			)}
		</div>
	);
};
