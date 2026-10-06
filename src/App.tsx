import React from 'react';
import { PulseProvider } from './context/PulseContext';
import { AppShell } from './components/layout/AppShell';

export function App() {
  return (
    <PulseProvider>
      <AppShell />
    </PulseProvider>
  );
}

export default App;
