import { useEffect, useRef } from 'react';

interface Props {
  onComplete: () => void;
}

const DURATION_MS = 700;

interface BoltParams {
  startOffsetRange: number;
  xRange: number;
  yRange: number;
  pathLimit: number;
  growerLimit: number;
  branchChance: number;
  maxBolts: number;
}

const SMALL_PARAMS: BoltParams = {
  startOffsetRange: 4,
  xRange: 6,
  yRange: 10,
  pathLimit: 12,
  growerLimit: 1,
  branchChance: 0.15,
  maxBolts: 2,
};

const LARGE_PARAMS: BoltParams = {
  startOffsetRange: 15,
  xRange: 14,
  yRange: 12,
  pathLimit: 14,
  growerLimit: 5,
  branchChance: 0.25,
  maxBolts: 2,
};

interface Bolt {
  startX: number;
  path: Array<{ x: number; y: number }>;
  done: boolean;
  growerCount: number;
  alpha: number;
}

export function LightningEffect({ onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cw = canvas.offsetWidth || 128;
    const ch = canvas.offsetHeight || 85;
    canvas.width = cw;
    canvas.height = ch;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const p = cw < 200 ? SMALL_PARAMS : LARGE_PARAMS;

    // Create initial bolts starting at top-center
    const bolts: Bolt[] = [];
    for (let i = 0; i < p.maxBolts; i++) {
      const startX = cw / 2 + (Math.random() - 0.5) * 2 * p.startOffsetRange;
      bolts.push({
        startX,
        path: [{ x: startX, y: 0 }],
        done: false,
        growerCount: 0,
        alpha: 0.8 + Math.random() * 0.2,
      });
    }

    let startTime: number | null = null;
    let flashDone = false;
    let rafId: number;

    function animate(timestamp: number) {
      if (!ctx) return;
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;

      if (elapsed >= DURATION_MS) {
        ctx.clearRect(0, 0, cw, ch);
        onCompleteRef.current();
        return;
      }

      // Fade previous frame toward transparent (destination-out reduces alpha, revealing card background)
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = 'source-over';

      // White flash during first 80ms
      if (!flashDone) {
        if (elapsed < 80) {
          const flashAlpha = 0.6 * (1 - elapsed / 80);
          ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha.toFixed(3)})`;
          ctx.fillRect(0, 0, cw, ch);
        } else {
          flashDone = true;
        }
      }

      // Grow and render each bolt
      for (const bolt of bolts) {
        // Advance the bolt one step
        if (!bolt.done) {
          bolt.growerCount++;
          if (bolt.growerCount >= p.growerLimit) {
            bolt.growerCount = 0;
            const last = bolt.path[bolt.path.length - 1];
            const nx = last.x + (Math.random() - 0.5) * 2 * p.xRange;
            const ny = last.y + p.yRange * (0.7 + Math.random() * 0.6);
            bolt.path.push({
              x: Math.max(0, Math.min(cw, nx)),
              y: ny,
            });
            if (bolt.path.length >= p.pathLimit || ny >= ch) {
              bolt.done = true;
            }
          }
        }

        if (bolt.path.length < 2) continue;

        // Draw main bolt path
        const flickerAlpha = bolt.alpha * (0.7 + Math.random() * 0.3);
        ctx.beginPath();
        ctx.moveTo(bolt.path[0].x, bolt.path[0].y);
        for (let i = 1; i < bolt.path.length; i++) {
          ctx.lineTo(bolt.path[i].x, bolt.path[i].y);
        }
        ctx.strokeStyle = `rgba(255, 255, 255, ${flickerAlpha.toFixed(3)})`;
        ctx.lineWidth = 1 + Math.random();
        ctx.stroke();

        // Draw an occasional branch from the bolt
        if (bolt.done && Math.random() < p.branchChance && bolt.path.length > 3) {
          const minIdx = Math.floor(bolt.path.length * 0.3);
          const maxIdx = Math.floor(bolt.path.length * 0.8);
          const branchOrigin = bolt.path[minIdx + Math.floor(Math.random() * (maxIdx - minIdx))];

          ctx.beginPath();
          ctx.moveTo(branchOrigin.x, branchOrigin.y);
          let bx = branchOrigin.x;
          let by = branchOrigin.y;
          const steps = 2 + Math.floor(Math.random() * 3);
          for (let s = 0; s < steps; s++) {
            bx += (Math.random() - 0.5) * p.xRange * 1.5;
            by += p.yRange * (0.5 + Math.random() * 0.5);
            ctx.lineTo(Math.max(0, Math.min(cw, bx)), by);
          }
          ctx.strokeStyle = `rgba(200, 220, 255, ${(flickerAlpha * 0.6).toFixed(3)})`;
          ctx.lineWidth = 0.5 + Math.random() * 0.5;
          ctx.stroke();
        }
      }

      rafId = requestAnimationFrame(animate);
    }

    rafId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(rafId);
      ctx.clearRect(0, 0, cw, ch);
    };
  }, []); // runs once on mount; keyed by seq in parent for re-mounts

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: -1,
        borderRadius: 'inherit',
      }}
    />
  );
}
