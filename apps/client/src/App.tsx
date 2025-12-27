import React from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GameHUD } from './components/GameHUD';

const App: React.FC = () => {
  return (
    <>
      <GameCanvas />
      <GameHUD />
    </>
  );
};

export default App;
