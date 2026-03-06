import './index.css';
import 'alt1/base';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// Tell Alt1 which app this is (required for permission management)
if (typeof alt1 !== 'undefined') {
  alt1.identifyAppUrl('./appconfig.json');
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
