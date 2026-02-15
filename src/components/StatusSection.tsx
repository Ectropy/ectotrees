import type { WorldState } from '../types';
import { TREE_TYPE_SHORT, SAPLING_MATURE_MS, ALIVE_DEAD_MS, DEAD_CLEAR_MS, formatMs } from '../constants/evilTree';

interface Props {
  state: WorldState;
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

export function StatusSection({ state }: Props) {
  const now = Date.now();
  const locationLabel = state.treeExactLocation ?? (state.treeHint ? abbreviateHint(state.treeHint) : undefined);

  if (state.treeStatus === 'dead' && state.deadAt !== undefined) {
    const clearAt = state.deadAt + DEAD_CLEAR_MS;
    const remaining = clearAt - now;
    return (
      <div className="flex flex-col justify-center h-full">
        <div className="text-red-400 text-[11px] font-bold leading-tight">R.I.P.</div>
        <div className="text-gray-400 text-[9px] leading-tight">
          {`Rewards avail. for <${formatMs(remaining)}`}
        </div>
      </div>
    );
  }

  if (state.treeStatus === 'sapling' && state.treeSetAt !== undefined) {
    const matureAt = state.treeSetAt + SAPLING_MATURE_MS;
    const remaining = matureAt - now;
    return (
      <div className="flex flex-col justify-center h-full">
        <div className="text-green-400 text-[10px] font-bold leading-tight">Strange Sapling</div>
        {locationLabel && (
          <div className="text-gray-400 text-[9px] leading-tight truncate">
            {locationLabel}
          </div>
        )}
        <div className="text-yellow-300 text-[9px] leading-tight">
          {`Matures in ~${formatMs(remaining)} or less`}
        </div>
      </div>
    );
  }

  if (state.treeStatus === 'mature' && state.matureAt !== undefined) {
    const autoDeadAt = state.matureAt + ALIVE_DEAD_MS;
    const remaining = autoDeadAt - now;
    return (
      <div className="flex flex-col justify-center h-full">
        <div className="text-yellow-300 text-[10px] font-bold leading-tight">Mature</div>
        {locationLabel && (
          <div className="text-gray-400 text-[9px] leading-tight truncate">
            {locationLabel}
          </div>
        )}
        <div className="text-orange-400 text-[9px] leading-tight">
          {`Dies in ~${formatMs(remaining)} or less`}
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
        <div className="text-emerald-400 text-[10px] font-bold leading-tight">{label}</div>
        {locationLabel && (
          <div className="text-gray-400 text-[9px] leading-tight truncate">
            {locationLabel}
          </div>
        )}
        <div className="text-orange-400 text-[9px] leading-tight">
          {`Dies in ~${formatMs(remaining)} or less`}
        </div>
      </div>
    );
  }

  if (state.nextSpawnTarget !== undefined) {
    const remaining = state.nextSpawnTarget - now;
    if (remaining > 0) {
      return (
        <div className={`flex ${locationLabel ? 'flex-col justify-center' : 'items-center'} h-full`}>
          <div className="text-blue-300 text-[10px] font-bold leading-tight">Next: {formatMs(remaining)}</div>
          {locationLabel && (
            <div className="text-gray-400 text-[9px] leading-tight truncate">
              {locationLabel}
            </div>
          )}
        </div>
      );
    }
  }

  return (
    <div className="flex items-center h-full">
      <span className="text-gray-600 text-[9px]">—</span>
    </div>
  );
}
