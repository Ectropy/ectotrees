import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Star, EyeOff } from 'lucide-react';
import { P2P_COLOR, F2P_COLOR, TEXT_COLOR } from '../constants/toolColors';
import type { WorldConfig, WorldState } from '../types';
import { StatusSection } from './StatusSection';
import { SpawnTimerTool } from './SpawnTimerTool';
import { TreeInfoTool } from './TreeInfoTool';
import { TreeDeadTool } from './TreeDeadTool';
import { LightningEffect } from './LightningEffect';
import { SparkEffect } from './SparkEffect';

interface Props {
  world: WorldConfig;
  state: WorldState;
  isFavorite: boolean;
  isHidden: boolean;
  onToggleFavorite: () => void;
  onToggleHidden: () => void;
  onCardClick: () => void;
  onOpenTool: (tool: 'spawn' | 'tree' | 'dead') => void;
  lightningEvent?: { kind: string; seq: number };
  onDismissLightning?: () => void;
  effectsLightning?: boolean;
  effectsSparks?: boolean;
  isActiveWorld?: boolean;
  isRecentOwnSubmission?: boolean;
  canEdit?: boolean;
}

export function WorldCard({ world, state, isFavorite, isHidden, onToggleFavorite, onToggleHidden, onCardClick, onOpenTool, lightningEvent, onDismissLightning, effectsLightning, effectsSparks, isActiveWorld, isRecentOwnSubmission, canEdit = true }: Props) {
  const isP2P = world.type === 'P2P';
  const cardRef = useRef<HTMLDivElement>(null);
  const [sparkReady, setSparkReady] = useState(false);
  useEffect(() => {
    if (state.treeStatus !== 'dead') { setSparkReady(false); return; }
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => setSparkReady(true));
      return () => window.cancelIdleCallback?.(id);
    }

    const timeoutId = window.setTimeout(() => setSparkReady(true), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state.treeStatus]);
  const borderColor = isP2P ? P2P_COLOR.border : F2P_COLOR.border;

  // Scroll active world's card into view when it becomes selected
  useEffect(() => {
    if (isActiveWorld) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isActiveWorld]);

  // Recent submission flash: black → gray-800 over 120 seconds
  const [flashPhase, setFlashPhase] = useState<'idle' | 'black' | 'fade'>('idle');
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isRecentOwnSubmission) return;
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashPhase('black');
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlashPhase('fade');
        flashTimerRef.current = setTimeout(() => setFlashPhase('idle'), 120000);
      });
    });
    return () => cancelAnimationFrame(raf1);
  }, [isRecentOwnSubmission]);

  const flashStyle: CSSProperties =
    flashPhase === 'black'
      ? { backgroundColor: '#000000' }
      : flashPhase === 'fade'
        ? { backgroundColor: '#1f2937', transition: 'background-color 120s ease-out' }
        : {};

  // Selection / pairing highlights
  const pairRing = isActiveWorld ? 'ring-2 ring-white ring-inset' : '';

  return (
    <div
      ref={cardRef}
      data-testid={`world-card-${world.id}`}
      className={`flex flex-col border ${borderColor} rounded bg-gray-800 text-white cursor-pointer ${pairRing}`}
      style={{ height: '85px', position: 'relative', isolation: 'isolate', ...flashStyle }}
      onClick={onCardClick}
    >
      <div className="flex items-center justify-between px-1.5 pt-1 flex-shrink-0">
        <div className="flex items-center gap-1">
          <span className={`text-[11px] font-bold ${TEXT_COLOR.prominent}`}>w{world.id}</span>
          <button
            onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
            className={`text-[11px] leading-none transition-colors ${
              isFavorite ? 'text-amber-400' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            <Star className={`h-2.5 w-2.5${isFavorite ? ' fill-current' : ''}`} />
          </button>
          {isHidden && (
            <button
              onClick={e => { e.stopPropagation(); onToggleHidden(); }}
              className="text-[11px] leading-none text-red-400 hover:text-red-300 transition-colors"
            >
              <EyeOff className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
        <span
          className={`text-[8px] font-semibold px-1 py-px rounded
            ${isP2P ? P2P_COLOR.badge : F2P_COLOR.badge}`}
        >
          {world.type}
        </span>
      </div>

      <div className="flex-1 px-1.5 min-h-0">
        <StatusSection state={state} />
      </div>

      {canEdit && (
        <div
          className="flex items-center justify-around px-1 pb-1 flex-shrink-0"
          onClick={e => e.stopPropagation()}
        >
          <SpawnTimerTool onClick={() => onOpenTool('spawn')} />
          <TreeInfoTool onClick={() => onOpenTool('tree')} />
          <TreeDeadTool onClick={() => onOpenTool('dead')} />
        </div>
      )}
      {lightningEvent && (effectsLightning ?? true) && (
        <LightningEffect key={lightningEvent.seq} onComplete={onDismissLightning ?? (() => {})} />
      )}
      {state.treeStatus === 'dead' && sparkReady && (effectsSparks ?? true) && <SparkEffect />}
    </div>
  );
}
