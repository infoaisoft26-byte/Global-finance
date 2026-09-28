import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './AppOptimized.tsx';
import './index.css';
import './styles/dashboardHeroContrast.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
