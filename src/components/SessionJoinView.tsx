import { useMemo } from 'react';
import worldsConfig from '../data/worlds.json';
import type { WorldStates, WorldState } from '../types';
import { TREE_TYPE_SHORT } from '../constants/evilTree';
import type { TreeType } from '../constants/evilTree';
import { P2P_COLOR, F2P_COLOR, TEXT_COLOR } from '../constants/toolColors';

interface Props {
  code: string;
  localWorldStates: WorldStates;
  serverWorlds: WorldStates;
  onJoin: (localStates?: WorldStates) => void;
  onCancel: () => void;
}

interface WorldConfig {
  id: number;
  type: 'P2P' | 'F2P';
}

const worlds = worldsConfig.worlds as WorldConfig[];
const worldTypeMap = new Map<number, 'P2P' | 'F2P'>(worlds.map(w => [w.id, w.type]));


function isLocalActive(state: WorldState): boolean {
  return state.treeStatus !== 'none' || state.nextSpawnTarget !== undefined;
}

function statusLabel(state: WorldState): string {
  if (state.nextSpawnTarget !== undefined && state.treeStatus === 'none') return 'Spawn timer';
  // Show dead/alive status before tree type — a dead mature tree should say "Dead", not "Mature (unknown)"
  if (state.treeStatus === 'dead') return 'Dead';
  if (state.treeStatus === 'alive') return 'Alive';
  if (state.treeType) return TREE_TYPE_SHORT[state.treeType as TreeType] ?? state.treeStatus;
  switch (state.treeStatus) {
    case 'sapling': return 'Sapling';
    case 'mature':  return 'Mature';
    default:        return state.treeStatus;
  }
}

function worldStatesEqual(a: WorldState, b: WorldState): boolean {
  return a.treeStatus === b.treeStatus
    && a.nextSpawnTarget === b.nextSpawnTarget
    && a.treeType === b.treeType
    && a.treeHint === b.treeHint
    && a.treeExactLocation === b.treeExactLocation
    && a.treeHealth === b.treeHealth;
}

function WorldTypeBadge({ worldId }: { worldId: number }) {
  const type = worldTypeMap.get(worldId);
  if (!type) return null;
  const cls = type === 'P2P' ? P2P_COLOR.badge : F2P_COLOR.badge;
  return (
    <span className={`text-[9px] px-1 rounded leading-none py-0.5 ${cls}`}>{type}</span>
  );
}

function WorldList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items}
    </ul>
  );
}

interface SectionProps {
  title: string;
  count: number;
  description: string;
  accentClass: string;
  children: React.ReactNode;
}

function Section({ title, count, description, accentClass, children }: SectionProps) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${accentClass}`}>{title}</span>
        <span className={`text-[11px] px-1.5 py-0.5 rounded-full bg-gray-700 ${TEXT_COLOR.muted}`}>{count}</span>
      </div>
      <p className={`text-[11px] ${TEXT_COLOR.muted} leading-snug`}>{description}</p>
      {children}
    </div>
  );
}

export function SessionJoinView({ code, localWorldStates, serverWorlds, onJoin, onCancel }: Props) {
  const { toContribute, conflicts, alreadySynced, serverGains } = useMemo(() => {
    const localActive = Object.entries(localWorldStates)
      .filter(([, s]) => isLocalActive(s))
      .map(([id, s]) => ({ id: Number(id), state: s }));

    const toContribute  = localActive.filter(({ id }) => !(id in serverWorlds));
    const conflicts     = localActive.filter(({ id, state }) => id in serverWorlds && !worldStatesEqual(state, serverWorlds[id]));
    const alreadySynced = localActive.filter(({ id, state }) => id in serverWorlds && worldStatesEqual(state, serverWorlds[id]));
    const serverGains   = Object.entries(serverWorlds)
      .map(([id, state]) => ({ id: Number(id), state }))
      .filter(({ id }) => !isLocalActive(localWorldStates[id] ?? { treeStatus: 'none' }));

    return { toContribute, conflicts, alreadySynced, serverGains };
  }, [serverWorlds, localWorldStates]);

  function handleJoin(contribute: boolean) {
    onJoin(contribute ? localWorldStates : undefined);
  }

  const canContribute = toContribute.length > 0;

  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-6">
      <div className="max-w-lg mx-auto flex flex-col gap-4">

        {/* Header */}
        <div>
          <h1 className={`text-xl font-bold ${TEXT_COLOR.prominent}`}>Join Session</h1>
          <p className={`text-sm ${TEXT_COLOR.muted} mt-0.5`}>
            Code: <span className="font-mono font-bold text-amber-400">{code}</span>
          </p>
        </div>

        {/* Comparison sections */}
        {/* Worlds to contribute */}
        {toContribute.length > 0 && (
          <Section
            title="Your worlds to contribute"
            count={toContribute.length}
            description="Active in your local data but not yet in the session. These will be shared with everyone if you choose to contribute."
            accentClass="text-green-400"
          >
            <WorldList items={toContribute.map(({ id, state }) => (
              <li key={id} className="flex items-center gap-1.5 text-[11px]">
                <span className={`font-mono ${TEXT_COLOR.prominent}`}>W{id}</span>
                <WorldTypeBadge worldId={id} />
                <span className={TEXT_COLOR.muted}>{statusLabel(state)}</span>
              </li>
            ))} />
          </Section>
        )}

        {/* Conflicts */}
        {conflicts.length > 0 && (
          <Section
            title="Your worlds the session overrides"
            count={conflicts.length}
            description="Both you and the session have data for these worlds. The session's version will be used; your local version is replaced."
            accentClass="text-amber-400"
          >
            <WorldList items={conflicts.map(({ id, state }) => (
              <li key={id} className="flex items-center gap-1.5 text-[11px] flex-wrap">
                <span className={`font-mono ${TEXT_COLOR.prominent}`}>W{id}</span>
                <WorldTypeBadge worldId={id} />
                <span className={TEXT_COLOR.muted}>
                  <span className="line-through opacity-60">{statusLabel(state)}</span>
                  <span className="mx-1 opacity-50">→</span>
                  <span>{statusLabel(serverWorlds[id])}</span>
                </span>
              </li>
            ))} />
          </Section>
        )}

        {/* Already in sync */}
        {alreadySynced.length > 0 && (
          <Section
            title="Already in sync"
            count={alreadySynced.length}
            description="Both you and the session have identical data for these worlds."
            accentClass={TEXT_COLOR.muted}
          >
            <WorldList items={alreadySynced.map(({ id, state }) => (
              <li key={id} className="flex items-center gap-1.5 text-[11px]">
                <span className={`font-mono ${TEXT_COLOR.prominent}`}>W{id}</span>
                <WorldTypeBadge worldId={id} />
                <span className={TEXT_COLOR.muted}>{statusLabel(state)}</span>
              </li>
            ))} />
          </Section>
        )}

        {/* New worlds from server */}
        {serverGains.length > 0 && (
          <Section
            title="New worlds you'll receive"
            count={serverGains.length}
            description="Active in the session but not in your local data. You gain this intel just by joining."
            accentClass="text-blue-400"
          >
            <WorldList items={serverGains.map(({ id, state }) => (
              <li key={id} className="flex items-center gap-1.5 text-[11px]">
                <span className={`font-mono ${TEXT_COLOR.prominent}`}>W{id}</span>
                <WorldTypeBadge worldId={id} />
                <span className={TEXT_COLOR.muted}>{statusLabel(state)}</span>
              </li>
            ))} />
          </Section>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-2 pt-1">
          {canContribute && (
            <button
              onClick={() => handleJoin(true)}
              className="w-full bg-green-700 hover:bg-green-600 text-white font-medium rounded py-2.5 transition-colors"
            >
              {`Join and contribute (${toContribute.length} world${toContribute.length !== 1 ? 's' : ''})`}
            </button>
          )}
          <button
            onClick={() => handleJoin(false)}
            className={`w-full text-white font-medium rounded py-2.5 transition-colors ${
              canContribute
                ? 'bg-gray-700 hover:bg-gray-600'
                : 'bg-blue-700 hover:bg-blue-600'
            }`}
          >
            {canContribute ? 'Join, discard my local data' : 'Join session'}
          </button>
          <button
            onClick={onCancel}
            className={`w-full text-sm transition-colors ${TEXT_COLOR.muted} hover:text-gray-200`}
          >
            Don't join
          </button>
        </div>

      </div>
    </div>
  );
}
