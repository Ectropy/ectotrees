import { useState, useEffect } from 'react';
import { TREE_COLOR } from '../constants/toolColors';

const POLL_INTERVAL_MS = 15 * 60 * 1000; // every 15 minutes

export function UpdateBanner({ defaultVisible = false }: { defaultVisible?: boolean }) {
  const [visible, setVisible] = useState(defaultVisible);

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    async function check() {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { version?: string };
        if (data.version && data.version !== __APP_VERSION__) {
          setVisible(true);
        }
      } catch {
        // network error — silently skip
      }
    }

    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg shadow-lg text-sm text-gray-200">
      <span>A new version of Ectotrees is available.</span>
      <button
        onClick={() => window.location.reload()}
        className={`px-3 py-1 bg-transparent ${TREE_COLOR.border} ${TREE_COLOR.label} ${TREE_COLOR.borderHover} text-xs rounded transition-colors font-medium`}
      >
        Reload
      </button>
      <button
        onClick={() => setVisible(false)}
        className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
