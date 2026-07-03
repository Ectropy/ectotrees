import type { WorldState } from '../types';
import { TREE_TYPE_SHORT, SAPLING_MATURE_MS, ALIVE_DEAD_MS, DEAD_CLEAR_MS } from '../constants/evilTree';
import { TREE_STATE_COLOR, TEXT_COLOR } from '../constants/toolColors';
import { Countdown } from './Countdown';

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
  const locationLabel = state.treeExactLocation ?? (state.treeHint ? abbreviateHint(state.treeHint) : undefined);
  // Hover reveals the full, un-abbreviated value since the label truncates
  const locationTitle = state.treeExactLocation ?? state.treeHint;

  if (state.treeStatus === 'dead' && state.deadAt !== undefined) {
    const clearAt = state.deadAt + DEAD_CLEAR_MS;
    return (
      <div className="flex flex-col justify-center h-full">
        <div className={`${TREE_STATE_COLOR.dead} text-[11px] font-bold leading-tight`}>R.I.P.</div>
        {locationLabel && (
          <div className={`${TEXT_COLOR.muted} text-[9px] leading-tight truncate`} title={locationTitle}>
            {locationLabel}
          </div>
        )}
        <Countdown
          target={clearAt}
          prefix={'Rewards avail. for <'}
          className={`${TREE_STATE_COLOR.dead} text-[9px] leading-tight`}
        />
      </div>
    );
  }

  if (state.treeStatus === 'sapling' && state.treeSetAt !== undefined) {
    const matureAt = state.treeSetAt + SAPLING_MATURE_MS;
    const label = state.treeType ? TREE_TYPE_SHORT[state.treeType] : 'Sapling (unknown)';
    return (
      <div className="flex flex-col justify-center h-full">
        <div className={`${TREE_STATE_COLOR.sapling} text-[10px] font-bold leading-tight`}>{label}</div>
        {locationLabel && (
          <div className={`${TEXT_COLOR.muted} text-[9px] leading-tight truncate`} title={locationTitle}>
            {locationLabel}
          </div>
        )}
        <Countdown
          target={matureAt}
          prefix="Matures in ~"
          suffix=" or less"
          className={`${TREE_STATE_COLOR.saplingTimer} text-[9px] leading-tight`}
        />
      </div>
    );
  }

  if (state.treeStatus === 'mature' && state.matureAt !== undefined) {
    const autoDeadAt = state.matureAt + ALIVE_DEAD_MS;
    const label = state.treeType && state.treeType !== 'mature'
      ? TREE_TYPE_SHORT[state.treeType]
      : 'Mature';
    return (
      <div className="flex flex-col justify-center h-full">
        <div className={`${TREE_STATE_COLOR.matureAlive} text-[10px] font-bold leading-tight`}>
          {label}{state.treeHealth !== undefined && <span className={`${TEXT_COLOR.muted} font-normal`}> · {state.treeHealth}%</span>}
        </div>
        {locationLabel && (
          <div className={`${TEXT_COLOR.muted} text-[9px] leading-tight truncate`} title={locationTitle}>
            {locationLabel}
          </div>
        )}
        <Countdown
          target={autoDeadAt}
          prefix="Dies in ~"
          suffix=" or less"
          className={`${TREE_STATE_COLOR.deathTimer} text-[9px] leading-tight`}
        />
      </div>
    );
  }

  if (state.treeStatus === 'alive' && state.matureAt !== undefined) {
    const autoDeadAt = state.matureAt + ALIVE_DEAD_MS;
    const label = state.treeType ? TREE_TYPE_SHORT[state.treeType] : 'Tree';
    return (
      <div className="flex flex-col justify-center h-full">
        <div className={`${TREE_STATE_COLOR.matureAlive} text-[10px] font-bold leading-tight`}>
          {label}{state.treeHealth !== undefined && <span className={`${TEXT_COLOR.muted} font-normal`}> · {state.treeHealth}%</span>}
        </div>
        {locationLabel && (
          <div className={`${TEXT_COLOR.muted} text-[9px] leading-tight truncate`} title={locationTitle}>
            {locationLabel}
          </div>
        )}
        <Countdown
          target={autoDeadAt}
          prefix="Dies in ~"
          suffix=" or less"
          className={`${TREE_STATE_COLOR.deathTimer} text-[9px] leading-tight`}
        />
      </div>
    );
  }

  if (state.nextSpawnTarget !== undefined) {
    // The countdown clamps at 0; the 1s transition tick flips the world to
    // sapling moments after the target passes, so the clamp is only visible briefly.
    return (
      <div className={`flex ${locationLabel ? 'flex-col justify-center' : 'items-center'} h-full`}>
        <Countdown
          target={state.nextSpawnTarget}
          prefix="Next: "
          className={`${TREE_STATE_COLOR.spawnTimer} text-[10px] font-bold leading-tight`}
        />
        {locationLabel && (
          <div className={`${TEXT_COLOR.muted} text-[9px] leading-tight truncate`}>
            {locationLabel}
          </div>
        )}
      </div>
    );
  }

  return locationLabel ? (
    <div className="flex flex-col justify-center h-full">
      <div className={`${TEXT_COLOR.ghost} text-[9px] leading-tight`}>—</div>
      <div className={`${TEXT_COLOR.muted} text-[9px] leading-tight truncate`} title={locationTitle}>
        {locationLabel}
      </div>
    </div>
  ) : (
    <div className="flex items-center h-full">
      <span className={`${TEXT_COLOR.ghost} text-[9px]`}>—</span>
    </div>
  );
}
