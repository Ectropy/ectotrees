interface StatusBannerProps {
  message: string | null;
  variant: 'error' | 'success' | 'warn' | '';
  onDismiss?: () => void;
}

export function StatusBanner({ message, variant, onDismiss }: StatusBannerProps) {
  if (!message) return null;

  const colors = {
    error: 'bg-destructive/15 border-destructive text-destructive',
    success: 'bg-success/15 border-success text-success',
    warn: 'bg-warning/15 border-warning text-warning',
    '': 'bg-muted border-border text-muted-foreground',
  };

  return (
    <div
      className={`text-[11px] px-2.5 py-1.5 mx-3 mt-1.5 rounded border ${colors[variant]}`}
      onClick={onDismiss}
    >
      {message}
    </div>
  );
}
