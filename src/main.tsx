import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@ncdai/react-wheel-picker/style.css'
import App from './App.tsx'
import './registerServiceWorker.ts'
import { TooltipProvider } from './components/ui/tooltip.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
)
