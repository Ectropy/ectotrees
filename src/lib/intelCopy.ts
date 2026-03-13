import type { WorldConfig, WorldState, WorldStates } from '../types';
import { ALIVE_DEAD_MS, DEAD_CLEAR_MS, TREE_TYPE_SHORT } from '../constants/evilTree';

function buildWorldLine(world: WorldConfig, state: WorldState): string {
  let ts: number | undefined;
  let label: string | undefined;

  if (state.treeStatus === 'none' && state.nextSpawnTarget !== undefined) {
    ts = state.nextSpawnTarget;
    label = 'spawning';
  } else if (state.treeStatus === 'sapling' && state.matureAt !== undefined) {
    ts = state.matureAt;
    label = 'matures';
  } else if ((state.treeStatus === 'mature' || state.treeStatus === 'alive') && state.matureAt !== undefined) {
    ts = state.matureAt + ALIVE_DEAD_MS;
    label = 'dies';
  } else if (state.treeStatus === 'dead' && state.deadAt !== undefined) {
    ts = state.deadAt + DEAD_CLEAR_MS;
    label = 'dead. Reward window ends';
  }

  if (!label || ts === undefined) return '';

  const parts: string[] = [`World \`${world.id}\``];

  if (state.treeType && state.treeStatus !== 'dead') {
    parts.push(TREE_TYPE_SHORT[state.treeType]);
  }

  if ((state.treeStatus === 'mature' || state.treeStatus === 'alive') && state.treeHealth !== undefined) {
    parts.push(`${state.treeHealth}%`);
  }

  const discordTs = `<t:${Math.floor(ts / 1000)}:R>`;
  const utcTime = new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  const timeLabel = `(\`${utcTime}\`)`;
  parts.push(`${label} ${discordTs} ${timeLabel}`);

  const location = state.treeExactLocation || state.treeHint;
  if (location) {
    parts.push(location);
  }

  return parts.join(' ');
}

export function buildWorldIntel(world: WorldConfig, state: WorldState): string {
  return buildWorldLine(world, state);
}

export function buildDiscordMessage(filteredWorlds: WorldConfig[], worldStates: WorldStates): string {
  const lines: string[] = [];
  for (const world of filteredWorlds) {
    const state = worldStates[world.id] ?? { treeStatus: 'none' as const };
    const line = buildWorldLine(world, state);
    if (line) lines.push(line);
  }
  return lines.join('\n');
}
