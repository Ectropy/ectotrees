import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

// Reference: https://codepen.io/jiayihu/pen/QwvjMZ
// Ported from TweenLite to GSAP v3, coordinates scaled to container size
// instead of window size so it works at both card (85px) and full-screen scale.

function range(map: Record<string, number>, prop: string): number {
  const min = map[prop + 'Min'];
  const max = map[prop + 'Max'];
  return min + (max - min) * Math.random();
}

function spawn(
  el: HTMLElement,
  w: number,
  h: number,
  speed: number,
  isAlive: () => boolean,
) {
  // All coordinate ranges scaled proportionally from the 1920×1080 reference
  const start = {
    yMin: h - (h * 50) / 1080,
    yMax: h,
    xMin: w / 2 + (w * 10) / 1920,
    xMax: w / 2 + (w * 40) / 1920,
    scaleXMin: 0.1,
    scaleXMax: 1,
    scaleYMin: 1,
    scaleYMax: 2,
    scaleMin: 0.1,
    scaleMax: 0.25,
    opacityMin: 0.1,
    opacityMax: 0.4,
  };
  const mid = {
    yMin: h * 0.4,
    yMax: h * 0.9,
    xMin: w * 0.1,
    xMax: w * 0.9,
    scaleMin: 0.2,
    scaleMax: 0.8,
    opacityMin: 0.5,
    opacityMax: 1,
  };
  const end = {
    // yMin === yMax in the reference (fixed exit height above the container)
    yMin: -(h * 180) / 1080,
    yMax: -(h * 180) / 1080,
    xMin: -(w * 100) / 1920,
    xMax: w + (w * 180) / 1920,
    scaleMin: 0.1,
    scaleMax: 1,
    opacityMin: 0.4,
    opacityMax: 0.7,
  };

  const wholeDuration = (10 / speed) * (0.7 + Math.random() * 0.4);
  const delay = wholeDuration * Math.random();
  let partialDuration = (wholeDuration + 1) * (0.2 + Math.random() * 0.3);

  gsap.set(el, {
    y: range(start, 'y'),
    x: range(start, 'x'),
    scaleX: range(start, 'scaleX'),
    scaleY: range(start, 'scaleY'),
    scale: range(start, 'scale'),
    opacity: range(start, 'opacity'),
    visibility: 'hidden',
  });

  // Y axis: start → mid → end
  gsap.to(el, {
    duration: partialDuration,
    delay,
    y: range(mid, 'y'),
    ease: Math.random() < 0.5 ? 'linear' : 'back.inOut',
  });
  gsap.to(el, {
    duration: wholeDuration - partialDuration,
    delay: partialDuration + delay,
    y: range(end, 'y'),
    ease: 'back.in',
  });

  // X axis: start → mid → end
  gsap.to(el, {
    duration: partialDuration,
    delay,
    x: range(mid, 'x'),
    ease: 'power1.out',
  });
  gsap.to(el, {
    duration: wholeDuration - partialDuration,
    delay: partialDuration + delay,
    x: range(end, 'x'),
    ease: 'power1.in',
  });

  // Opacity + scale: start → mid → end (onComplete respawns)
  partialDuration = wholeDuration * (0.5 + Math.random() * 0.3);
  gsap.to(el, {
    duration: partialDuration,
    delay,
    scale: range(mid, 'scale'),
    autoAlpha: range(mid, 'opacity'),
    ease: 'none',
  });
  gsap.to(el, {
    duration: wholeDuration - partialDuration,
    delay: partialDuration + delay,
    scale: range(end, 'scale'),
    autoAlpha: range(end, 'opacity'),
    ease: 'none',
    onComplete: () => {
      if (isAlive()) spawn(el, w, h, speed, isAlive);
    },
  });
}

export function SparkEffect() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.offsetWidth || 128;
    const h = container.offsetHeight || 85;
    const speed = 2;

    // Scale density proportionally from the reference (density=70 at 1920×1080),
    // with a minimum so small cards always have a few sparks.
    const density = Math.max(6, Math.round((70 * w * h) / (1920 * 1080)));

    let alive = true;
    const isAlive = () => alive;

    const sparks: HTMLElement[] = [];
    for (let i = 0; i < density; i++) {
      const el = document.createElement('div');
      el.style.cssText =
        'position:absolute;width:4px;height:4px;border-radius:30%;' +
        'background-color:#DE4A00;box-shadow:0 0 5px #AB000B;visibility:hidden;';
      container.appendChild(el);
      sparks.push(el);
      spawn(el, w, h, speed, isAlive);
    }

    return () => {
      alive = false;
      gsap.killTweensOf(sparks);
      sparks.forEach(el => el.remove());
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: -1,
        borderRadius: 'inherit',
      }}
    />
  );
}
