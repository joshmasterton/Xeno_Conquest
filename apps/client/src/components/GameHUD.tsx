import React from 'react';
import { useGameStore } from '../store/gameStore';

export const GameHUD: React.FC = () => {
	const gold = useGameStore((s) => s.gold);
	const manpower = useGameStore((s) => s.manpower);
	const selectedNodeId = useGameStore((s) => s.selectedNodeId);
	const sendBuildOrder = useGameStore((s) => s.sendBuildOrder);

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
		</div>
	);
};
