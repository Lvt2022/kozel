import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { KozelClientProvider } from './KozelClientProvider.js';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <KozelClientProvider>
      <App />
    </KozelClientProvider>
  </React.StrictMode>
);
