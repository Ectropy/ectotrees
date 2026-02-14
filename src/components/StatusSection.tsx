import type { WorldState } from '../types';
import { TREE_TYPE_SHORT, SAPLING_MATURE_MS, ALIVE_DEAD_MS, DEAD_CLEAR_MS } from '../constants/evilTree';

interface Props {
  state: WorldState;
  tick: number;
}

function formatMs(ms: number): string {
  if (ms <= 0) return '0m';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function abbreviateHint(hint: string): string {
  return hint
    .replace(/^Close to /, '')
    .replace(/^Just outside /, '')
    .replace(/^Due west of /, 'W. ')
    .replace(/^Lands inhabited by /, '')
    .replace(/^Rare trees with /, '')
    .replace(/^South of /, 'S. ')
    .replace(/^North from /, 'N. ')
    .replace(/^On /, '');
}

export function StatusSection({ state, tick: _tick }: Props) {
  const now = Date.now();

  if (state.treeStatus === 'dead' && state.deadAt !== undefined) {
    const clearAt = state.deadAt + DEAD_CLEAR_MS;
    const remaining = clearAt - now;
    return (
      <div className="flex flex-col justify-center h-full">
        <div className="text-red-400 text-[11px] font-bold leading-tight">R.I.P.</div>
        <div className="text-gray-400 text-[9px] leading-tight">
          {`Clears ${formatMs(remaining)}`}
        </div>
      </div>
    );
  }

  if (state.treeStatus === 'sapling' && state.treeSetAt !== undefined) {
    const matureAt = state.treeSetAt + SAPLING_MATURE_MS;
    const remaining = matureAt - now;
    return (
      <div className="flex flex-col justify-center h-full">
        <div className="text-green-400 text-[10px] font-semibold leading-tight">Sapling</div>
        {state.treeHint && (
          <div className="text-gray-400 text-[9px] leading-tight truncate">
            {abbreviateHint(state.treeHint)}
          </div>
        )}
        <div className="text-yellow-300 text-[9px] leading-tight">
          {`Matures in ~${formatMs(remaining)}`}
        </div>
      </div>
    );
  }

  if (state.treeStatus === 'mature' && state.matureAt !== undefined) {
    const autoDeadAt = state.matureAt + ALIVE_DEAD_MS;
    const remaining = autoDeadAt - now;
    return (
      <div className="flex flex-col justify-center h-full">
        <div className="text-yellow-300 text-[10px] font-semibold leading-tight">Mature</div>
        {state.treeHint && (
          <div className="text-gray-400 text-[9px] leading-tight truncate">
            {abbreviateHint(state.treeHint)}
          </div>
        )}
        <div className="text-orange-400 text-[9px] leading-tight">
          {`Dies in ~${formatMs(remaining)}`}
        </div>
      </div>
    );
  }

  if (state.treeStatus === 'alive' && state.matureAt !== undefined) {
    const autoDeadAt = state.matureAt + ALIVE_DEAD_MS;
    const remaining = autoDeadAt - now;
    const label = state.treeType ? TREE_TYPE_SHORT[state.treeType] : 'Tree';
    return (
      <div className="flex flex-col justify-center h-full">
        <div className="text-emerald-400 text-[10px] font-semibold leading-tight">{label}</div>
        {state.treeHint && (
          <div className="text-gray-400 text-[9px] leading-tight truncate">
            {abbreviateHint(state.treeHint)}
          </div>
        )}
        <div className="text-orange-400 text-[9px] leading-tight">
          {`Dies in ~${formatMs(remaining)}`}
        </div>
      </div>
    );
  }

  if (state.nextSpawnTarget !== undefined) {
    const remaining = state.nextSpawnTarget - now;
    if (remaining > 0) {
      return (
        <div className={`flex ${state.treeHint ? 'flex-col justify-center' : 'items-center'} h-full`}>
          {state.treeHint && (
            <div className="text-gray-400 text-[9px] leading-tight truncate">
              {abbreviateHint(state.treeHint)}
            </div>
          )}
          <div className="text-blue-300 text-[10px] leading-tight">Next: {formatMs(remaining)}</div>
        </div>
      );
    }
    return (
      <div className="flex items-center h-full">
        <span className="text-green-300 text-[10px] font-bold">Spawned!</span>
      </div>
    );
  }

  return (
    <div className="flex items-center h-full">
      <span className="text-gray-600 text-[9px]">—</span>
    </div>
  );
}
