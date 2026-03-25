import { useEffect, useRef } from 'react';

interface Props {
  onComplete: () => void;
}

const DURATION_MS = 700;

interface BoltParams {
  xRange: number;
  yRange: number;
  pathLimit: number;
  growerLimit: number;
  maxChildren: number;
}

const SMALL_PARAMS: BoltParams = {
  xRange: 15,
  yRange: 10,
  pathLimit: 12,
  growerLimit: 2,
  maxChildren: 2,
};

const LARGE_PARAMS: BoltParams = {
  xRange: 40,
  yRange: 35,
  pathLimit: 50,
  growerLimit: 1,
  maxChildren: 2,
};

interface Bolt {
  path: Array<{ x: number; y: number }>;
  branches: Array<Array<{ x: number; y: number }>>;
  done: boolean;
  growerCount: number;
  alpha: number;
  isTrunk: boolean;
  targetY: number;
  xMin: number;
  xMax: number;
}

export function LightningEffect({ onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

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

    // One trunk bolt starts in the middle third and grows 20–50% down the card
    const startX = cw / 3 + Math.random() * (cw / 3);
    const trunkTargetY = ch * (0.05 + Math.random() * 0.15);
    const bolts: Bolt[] = [{
      path: [{ x: startX, y: 0 }],
      branches: [],
      done: false,
      growerCount: 0,
      alpha: 1.0,
      isTrunk: true,
      targetY: trunkTargetY,
      xMin: 0,
      xMax: cw,
    }];
    let childrenSpawned = false;

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

      // Only process bolts that existed at the start of this frame
      const boltCount = bolts.length;
      for (let bi = 0; bi < boltCount; bi++) {
        const bolt = bolts[bi];

        if (!bolt.done) {
          bolt.growerCount++;
          if (bolt.growerCount >= p.growerLimit) {
            bolt.growerCount = 0;
            const last = bolt.path[bolt.path.length - 1];

            if (bolt.isTrunk) {
              // Trunk grows straighter than children
              const nx = last.x + (Math.random() - 0.5) * 2 * (p.xRange / 3);
              const ny = last.y + p.yRange * (0.7 + Math.random() * 0.6);
              bolt.path.push({ x: Math.max(0, Math.min(cw, nx)), y: ny });
              if (ny >= bolt.targetY && !childrenSpawned) {
                bolt.done = true;
                childrenSpawned = true;
                const childCount = 2 + Math.floor(Math.random() * (p.maxChildren - 1));
                const origin = bolt.path[bolt.path.length - 1];
                for (let c = 0; c < childCount; c++) {
                  // Alternate sides: even index stays left of split, odd stays right
                  const xMin = c % 2 === 0 ? 0 : origin.x;
                  const xMax = c % 2 === 0 ? origin.x : cw;
                  bolts.push({
                    path: [{ x: origin.x, y: origin.y }],
                    branches: [],
                    done: false,
                    growerCount: 0,
                    alpha: 0.8 + Math.random() * 0.2,
                    isTrunk: false,
                    targetY: ch,
                    xMin,
                    xMax,
                  });
                }
              }
            } else {
              // Child bolts grow with full xRange toward the bottom, clamped to their side
              const nx = last.x + (Math.random() - 0.5) * 2 * p.xRange;
              const ny = last.y + p.yRange * (0.7 + Math.random() * 0.6);
              bolt.path.push({ x: Math.max(bolt.xMin, Math.min(bolt.xMax, nx)), y: ny });
              if (bolt.path.length >= p.pathLimit || ny >= ch) {
                bolt.done = true;
                // Generate branches once at completion
                const count = 1 + Math.floor(Math.random() * 2);
                for (let b = 0; b < count; b++) {
                  const minIdx = Math.floor(bolt.path.length * 0.3);
                  const maxIdx = Math.floor(bolt.path.length * 0.8);
                  const originIdx = minIdx + Math.floor(Math.random() * (maxIdx - minIdx));
                  const origin = bolt.path[originIdx];
                  const branch: Array<{ x: number; y: number }> = [{ x: origin.x, y: origin.y }];
                  let bx = origin.x;
                  let by = origin.y;
                  const steps = 2 + Math.floor(Math.random() * 4);
                  for (let s = 0; s < steps; s++) {
                    bx += (Math.random() - 0.5) * p.xRange * 1.5;
                    by += p.yRange * (0.5 + Math.random() * 0.5);
                    branch.push({ x: Math.max(bolt.xMin, Math.min(bolt.xMax, bx)), y: by });
                  }
                  bolt.branches.push(branch);
                }
              }
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

        // Draw stored branches (children only)
        for (const branch of bolt.branches) {
          if (branch.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(branch[0].x, branch[0].y);
          for (let i = 1; i < branch.length; i++) {
            ctx.lineTo(branch[i].x, branch[i].y);
          }
          ctx.strokeStyle = `rgba(250, 250, 255, ${flickerAlpha.toFixed(3)})`;
          ctx.lineWidth = 0.7;
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
