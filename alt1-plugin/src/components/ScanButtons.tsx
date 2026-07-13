import { ScanText, ScanEye, EyeClosed, Eye } from 'lucide-react';
import { Tooltip } from './ui/tooltip';

interface ScanButtonsProps {
  hasPixel: boolean;
  autoScan: boolean;
  isScanning: boolean;
  onScanDialog: () => void;
  onAutoScanToggle: () => void;
}

/** Manual-scan + auto-scan toggle pair rendered beside a form field. */
export function ScanButtons({ hasPixel, autoScan, isScanning, onScanDialog, onAutoScanToggle }: ScanButtonsProps) {
  return (
    <>
      <Tooltip
        content={hasPixel ? 'Scan dialogs for intel' : 'Pixel permission required to scan'}
        side="top"
      >
        <button
          onClick={onScanDialog}
          disabled={!hasPixel}
          aria-label="Scan Spirit Tree dialog"
          className="flex items-center justify-center w-7 h-7 shrink-0 bg-secondary border border-primary rounded text-primary disabled:border-border disabled:text-muted-foreground disabled:cursor-not-allowed hover:enabled:bg-primary/10 transition-colors"
        >
          <ScanText size={14} />
        </button>
      </Tooltip>
      <Tooltip
        content={autoScan ? 'Disable intel auto-detect' : 'Enable intel auto-detect'}
        side="top"
      >
        <button
          onClick={onAutoScanToggle}
          disabled={!hasPixel}
          aria-label="Toggle auto-scan"
          className={`flex items-center justify-center w-7 h-7 shrink-0 rounded transition-colors ${
            autoScan
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary border border-primary text-primary hover:enabled:bg-primary/10'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {!autoScan ? <ScanEye size={14} /> : isScanning ? <Eye size={14} /> : <EyeClosed size={14} />}
        </button>
      </Tooltip>
    </>
  );
}
