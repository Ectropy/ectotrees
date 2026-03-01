import { useState, useEffect, useMemo } from 'react';
import worldsConfig from '../data/worlds.json';
import type { WorldStates, WorldState } from '../types';
import { TREE_TYPE_SHORT } from '../constants/evilTree';
import type { TreeType } from '../constants/evilTree';
import { P2P_COLOR, F2P_COLOR, TEXT_COLOR } from '../constants/toolColors';

type ServerWorldSummary = Record<number, { treeStatus: string; treeType?: string; nextSpawnTarget?: number }>;

interface Props {
  code: string;
  localWorldStates: WorldStates;
  fetchSessionWorlds: (code: string) => Promise<ServerWorldSummary | null>;
  onJoin: (localStates?: WorldStates) => Promise<boolean>;
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

function localStatusLabel(state: WorldState): string {
  if (state.nextSpawnTarget !== undefined && state.treeStatus === 'none') return 'Spawn timer';
  if (state.treeType) return TREE_TYPE_SHORT[state.treeType as TreeType] ?? state.treeStatus;
  switch (state.treeStatus) {
    case 'sapling': return 'Sapling';
    case 'mature':  return 'Mature';
    case 'alive':   return 'Alive';
    case 'dead':    return 'Dead';
    default:        return state.treeStatus;
  }
}

function serverStatusLabel(s: { treeStatus: string; treeType?: string; nextSpawnTarget?: number }): string {
  if (s.nextSpawnTarget !== undefined && s.treeStatus === 'none') return 'Spawn timer';
  if (s.treeType) return TREE_TYPE_SHORT[s.treeType as TreeType] ?? s.treeStatus;
  switch (s.treeStatus) {
    case 'sapling': return 'Sapling';
    case 'mature':  return 'Mature';
    case 'alive':   return 'Alive';
    case 'dead':    return 'Dead';
    default:        return s.treeStatus;
  }
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
  empty: string;
  children: React.ReactNode;
}

function Section({ title, count, description, accentClass, empty, children }: SectionProps) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${accentClass}`}>{title}</span>
        <span className={`text-[11px] px-1.5 py-0.5 rounded-full bg-gray-700 ${TEXT_COLOR.muted}`}>{count}</span>
      </div>
      <p className={`text-[11px] ${TEXT_COLOR.muted} leading-snug`}>{description}</p>
      {count === 0
        ? <p className={`text-[11px] ${TEXT_COLOR.faint} italic`}>{empty}</p>
        : children}
    </div>
  );
}

export function SessionJoinView({ code, localWorldStates, fetchSessionWorlds, onJoin, onCancel }: Props) {
  const [serverWorlds, setServerWorlds] = useState<ServerWorldSummary | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSessionWorlds(code).then(result => {
      if (cancelled) return;
      if (result === null) {
        setLoadError(true);
      } else {
        setServerWorlds(result);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [code, fetchSessionWorlds]);

  const { toContribute, conflicts, serverGains } = useMemo(() => {
    if (!serverWorlds) return { toContribute: [] as { id: number; state: WorldState }[], conflicts: [] as { id: number; state: WorldState }[], serverGains: [] as { id: number; summary: ServerWorldSummary[number] }[] };

    const localActive = Object.entries(localWorldStates)
      .filter(([, s]) => isLocalActive(s))
      .map(([id, s]) => ({ id: Number(id), state: s }));

    const toContribute = localActive.filter(({ id }) => !(id in serverWorlds));
    const conflicts    = localActive.filter(({ id }) =>   id in serverWorlds);
    const serverGains  = Object.entries(serverWorlds)
      .map(([id, summary]) => ({ id: Number(id), summary }))
      .filter(({ id }) => !isLocalActive(localWorldStates[id] ?? { treeStatus: 'none' }));

    return { toContribute, conflicts, serverGains };
  }, [serverWorlds, localWorldStates]);

  async function handleJoin(contribute: boolean) {
    setJoining(true);
    await onJoin(contribute ? localWorldStates : undefined);
    // onJoin navigates away on success; if it returns, joining failed
    setJoining(false);
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

        {/* Loading */}
        {loading && (
          <div className={`text-sm ${TEXT_COLOR.muted} py-6 text-center`}>
            Loading session data…
          </div>
        )}

        {/* Error */}
        {loadError && (
          <div className="bg-red-900/40 border border-red-700 rounded p-3 text-sm text-red-300">
            Could not load session data. The session may have expired or there was a network error.
          </div>
        )}

        {/* Comparison sections */}
        {serverWorlds && (
          <>
            {/* Worlds to contribute */}
            <Section
              title="Your worlds to contribute"
              count={toContribute.length}
              description="Active in your local data but not yet in the session. These will be shared with everyone if you choose to contribute."
              accentClass="text-green-400"
              empty="None — you have nothing to add."
            >
              <WorldList items={toContribute.map(({ id, state }) => (
                <li key={id} className="flex items-center gap-1.5 text-[11px]">
                  <span className={`font-mono ${TEXT_COLOR.prominent}`}>W{id}</span>
                  <WorldTypeBadge worldId={id} />
                  <span className={TEXT_COLOR.muted}>{localStatusLabel(state)}</span>
                </li>
              ))} />
            </Section>

            {/* Conflicts */}
            <Section
              title="Your worlds the session overrides"
              count={conflicts.length}
              description="Both you and the session have data for these worlds. The session's version will be used; your local version is replaced."
              accentClass="text-amber-400"
              empty="None — no conflicts."
            >
              <WorldList items={conflicts.map(({ id, state }) => (
                <li key={id} className="flex items-center gap-1.5 text-[11px] flex-wrap">
                  <span className={`font-mono ${TEXT_COLOR.prominent}`}>W{id}</span>
                  <WorldTypeBadge worldId={id} />
                  <span className={TEXT_COLOR.muted}>
                    <span className="line-through opacity-60">{localStatusLabel(state)}</span>
                    <span className="mx-1 opacity-50">→</span>
                    <span>{serverStatusLabel(serverWorlds[id])}</span>
                  </span>
                </li>
              ))} />
            </Section>

            {/* New worlds from server */}
            <Section
              title="New worlds you'll receive"
              count={serverGains.length}
              description="Active in the session but not in your local data. You gain this intel just by joining."
              accentClass="text-blue-400"
              empty="None — the session has no extra intel."
            >
              <WorldList items={serverGains.map(({ id, summary }) => (
                <li key={id} className="flex items-center gap-1.5 text-[11px]">
                  <span className={`font-mono ${TEXT_COLOR.prominent}`}>W{id}</span>
                  <WorldTypeBadge worldId={id} />
                  <span className={TEXT_COLOR.muted}>{serverStatusLabel(summary)}</span>
                </li>
              ))} />
            </Section>
          </>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-2 pt-1">
          {loadError ? (
            <button
              onClick={onCancel}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium rounded py-2.5 transition-colors"
            >
              Go back
            </button>
          ) : serverWorlds ? (
            <>
              {canContribute && (
                <button
                  onClick={() => handleJoin(true)}
                  disabled={joining}
                  className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white font-medium rounded py-2.5 transition-colors"
                >
                  {joining ? 'Joining…' : `Join and contribute (${toContribute.length} world${toContribute.length !== 1 ? 's' : ''})`}
                </button>
              )}
              <button
                onClick={() => handleJoin(false)}
                disabled={joining}
                className={`w-full disabled:opacity-50 text-white font-medium rounded py-2.5 transition-colors ${
                  canContribute
                    ? 'bg-gray-700 hover:bg-gray-600'
                    : 'bg-blue-700 hover:bg-blue-600'
                }`}
              >
                {joining ? 'Joining…' : canContribute ? 'Join, discard my local data' : 'Join session'}
              </button>
              <button
                onClick={onCancel}
                disabled={joining}
                className={`w-full text-sm disabled:opacity-50 transition-colors ${TEXT_COLOR.muted} hover:text-gray-200`}
              >
                Don't join
              </button>
            </>
          ) : null}
        </div>

      </div>
    </div>
  );
}
