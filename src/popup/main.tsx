import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Popup } from './App';
import './popup.module.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');
createRoot(container).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
