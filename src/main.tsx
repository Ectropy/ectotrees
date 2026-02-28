import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@ncdai/react-wheel-picker/style.css'
import App from './App.tsx'
import './registerServiceWorker.ts'
import { TooltipProvider } from './components/ui/tooltip.tsx'

function preventMobilePinchZoom() {
  const blockGesture = (event: Event) => {
    event.preventDefault();
  };

  const blockMultiTouchMove = (event: TouchEvent) => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  };

  document.addEventListener('gesturestart', blockGesture, { passive: false });
  document.addEventListener('gesturechange', blockGesture, { passive: false });
  document.addEventListener('touchmove', blockMultiTouchMove, { passive: false });
}

preventMobilePinchZoom();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
)

