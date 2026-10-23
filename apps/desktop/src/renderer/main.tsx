import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Renderer root element is missing');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// T2.7/ADR-033: cold-start marker for the perf E2E spec. Two frames after mount
// means the shell has painted and is interactive; the mark stays inert in
// production (it is only a PerformanceEntry).
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    performance.mark('curve:app-ready');
  });
});
