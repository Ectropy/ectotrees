const STATUS_COLORS = {
  ok: 'text-success',
  warn: 'text-warning',
  error: 'text-destructive',
  '': 'text-muted-foreground',
};

interface StatusLineProps {
  statusMsg: string;
  statusKind: keyof typeof STATUS_COLORS;
  /** Margin utility — the forms place the line differently (mt-1.5 vs mb-2). */
  marginClass?: string;
}

/** Scan/submit feedback line — always rendered to reserve height and prevent reflow. */
export function StatusLine({ statusMsg, statusKind, marginClass = 'mt-1.5' }: StatusLineProps) {
  return (
    <div className={`${marginClass} text-[11px] min-h-[16px] ${STATUS_COLORS[statusKind]}`}>
      {statusMsg}
    </div>
  );
}
