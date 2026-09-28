import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './AppOptimized.tsx';
import { OFFICIAL_GLOBAL_FINANCE_LOGO } from './assets/officialGlobalFinanceLogo.ts';
import './index.css';
import './styles/dashboardHeroContrast.css';
import './styles/globalBrandLogo.css';

function applyOfficialGlobalFinanceBranding() {
  const root = document.documentElement;
  root.style.setProperty('--gf-logo', `url("${OFFICIAL_GLOBAL_FINANCE_LOGO}")`);

  const applyImages = () => {
    document.querySelectorAll<HTMLImageElement>('img[src*="global-finance-logo.webp"], img[data-global-finance-logo]').forEach((img) => {
      if (img.src !== OFFICIAL_GLOBAL_FINANCE_LOGO) {
        img.src = OFFICIAL_GLOBAL_FINANCE_LOGO;
        img.removeAttribute('srcset');
      }
      img.style.objectFit = 'contain';
      img.style.visibility = 'visible';
      img.style.opacity = '1';
    });
  };

  let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }
  favicon.type = 'image/webp';
  favicon.href = OFFICIAL_GLOBAL_FINANCE_LOGO;

  let appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
  if (!appleIcon) {
    appleIcon = document.createElement('link');
    appleIcon.rel = 'apple-touch-icon';
    document.head.appendChild(appleIcon);
  }
  appleIcon.href = OFFICIAL_GLOBAL_FINANCE_LOGO;

  applyImages();
  const observer = new MutationObserver(applyImages);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

applyOfficialGlobalFinanceBranding();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
