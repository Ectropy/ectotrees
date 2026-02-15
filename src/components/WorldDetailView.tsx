import { useState } from 'react';
import type { WorldConfig, WorldState } from '../types';
import { TREE_TYPE_LABELS, SAPLING_MATURE_MS, ALIVE_DEAD_MS, DEAD_CLEAR_MS, SPAWNED_CLEAR_MS } from '../constants/evilTree';

interface Props {
  world: WorldConfig;
  state: WorldState;
  onClear: () => void;
  onBack: () => void;
  onOpenTool: (tool: 'spawn' | 'tree' | 'dead') => void;
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

const STATUS_COLORS: Record<string, string> = {
  sapling: 'text-green-400',
  mature:  'text-yellow-300',
  alive:   'text-emerald-400',
  dead:    'text-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  sapling: 'Sapling',
  mature:  'Mature',
  alive:   'Alive',
  dead:    'Dead',
};

export function WorldDetailView({ world, state, onClear, onBack, onOpenTool }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  const isP2P = world.type === 'P2P';
  const isBlank = state.treeStatus === 'none' && !state.nextSpawnTarget;
  const now = Date.now();

  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-6">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={onBack}
            className="text-sm text-blue-400 hover:text-blue-300 mb-3 transition-colors"
          >
            ← Back
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">W{world.id} Status</h1>
            <p className="text-sm text-gray-400">
              <span className={isP2P ? 'text-yellow-200' : 'text-blue-200'}>{world.type}</span>
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Status info card */}
          <div className="bg-gray-800 border border-gray-700 rounded p-4">
            {isBlank ? (
              <p className="text-sm text-gray-500">No known information. =(<br /><br/>
              <a href='https://runescape.wiki/w/Evil_Tree#Locations' target='_blank' rel='noopener noreferrer' className='text-blue-400 hover:text-blue-300 underline'>There are several ways to find Evil trees.</a> Consider scouting this world to help others.
              </p>
            ) : (
              <dl className="space-y-2">
                {state.treeStatus !== 'none' && (
                  <Row label="Status">
                    <span className={STATUS_COLORS[state.treeStatus]}>
                      {STATUS_LABELS[state.treeStatus]}
                    </span>
                  </Row>
                )}

                {state.treeType && (
                  <Row label="Tree type">
                    <span className="text-gray-100">{TREE_TYPE_LABELS[state.treeType]}</span>
                  </Row>
                )}

                {state.treeHint && (
                  <Row label="Location">
                    <span className="text-gray-100">{state.treeHint}</span>
                  </Row>
                )}

                {state.treeExactLocation && (
                  <Row label="Exact location">
                    <span className="text-gray-100">{state.treeExactLocation}</span>
                  </Row>
                )}

                {state.treeStatus === 'sapling' && state.treeSetAt !== undefined && (() => {
                  const remaining = (state.treeSetAt + SAPLING_MATURE_MS) - now;
                  return (
                    <Row label="Matures in">
                      <span className="text-yellow-300">
                        {remaining > 0 ? `~${formatMs(remaining)}` : 'Now'}
                      </span>
                    </Row>
                  );
                })()}

                {(state.treeStatus === 'mature' || state.treeStatus === 'alive') && state.matureAt !== undefined && (
                  <Row label="Dies in">
                    <span className="text-orange-400">
                      ~{formatMs((state.matureAt + ALIVE_DEAD_MS) - now)}
                    </span>
                  </Row>
                )}

                {state.treeStatus === 'dead' && state.deadAt !== undefined && (
                  <Row label="Clears in">
                    <span className="text-gray-300">
                      {formatMs((state.deadAt + DEAD_CLEAR_MS) - now)}
                    </span>
                  </Row>
                )}

                {state.nextSpawnTarget !== undefined && (() => {
                  const remaining = state.nextSpawnTarget - now;
                  if (remaining > 0) {
                    return (
                      <Row label="Spawn in">
                        <span className="text-blue-300">{formatMs(remaining)}</span>
                      </Row>
                    );
                  }
                  return (
                    <>
                      <Row label="Status">
                        <span className="text-green-300 font-bold">Spawned!</span>
                      </Row>
                      <Row label="Clears in">
                        <span className="text-gray-300">
                          {formatMs((state.nextSpawnTarget + SPAWNED_CLEAR_MS) - now)}
                        </span>
                      </Row>
                    </>
                  );
                })()}
              </dl>
            )}
          </div>

          {/* Quick tool actions */}
          <div className="flex gap-2">
            <button
              onClick={() => onOpenTool('spawn')}
              className="flex-1 bg-gray-700 hover:bg-blue-700 text-white text-sm rounded py-2 transition-colors"
            >
              ⏱ Spawn Timer
            </button>
            <button
              onClick={() => onOpenTool('tree')}
              className="flex-1 bg-gray-700 hover:bg-green-700 text-white text-sm rounded py-2 transition-colors"
            >
              🌳 Tree Info
            </button>
            <button
              onClick={() => onOpenTool('dead')}
              className="flex-1 bg-gray-700 hover:bg-red-700 text-white text-sm rounded py-2 transition-colors"
            >
              ☠ Mark Dead
            </button>
          </div>

          {/* Close button */}
          <button
            onClick={onBack}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium rounded py-2.5 transition-colors"
          >
            Close
          </button>

          {/* Clear section */}
          {confirmClear ? (() => {
            const items: string[] = [];
            if (state.nextSpawnTarget !== undefined) {
              const remaining = state.nextSpawnTarget - now;
              items.push(remaining > 0
                ? `Spawn timer (${Math.ceil(remaining / 60000)}m remaining)`
                : 'Spawn timer (already triggered — "Spawned!" state)');
            }
            if (state.treeStatus !== 'none') items.push(`Tree status: ${state.treeStatus}`);
            if (state.treeType) items.push(`Tree type: ${TREE_TYPE_LABELS[state.treeType]}`);
            if (state.treeHint) items.push(`Location: ${state.treeHint}`);
            if (state.treeExactLocation) items.push(`Exact location: ${state.treeExactLocation}`);

            return (
              <div className="bg-gray-800 border border-amber-700 rounded p-4 space-y-3">
                <p className="text-sm text-gray-200">Reset World {world.id} to blank?</p>
                <p className="text-xs text-gray-400">
                  Use this to correct a mistake — wrong world, accidental entry, or test data. All recorded data will be wiped immediately.
                </p>
                {items.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Currently recorded:</p>
                    <ul className="space-y-0.5">
                      {items.map((item, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-gray-300">
                          <span className="text-amber-500 mt-px">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={onClear}
                    className="flex-1 bg-amber-700 hover:bg-amber-600 text-white font-medium rounded py-2 transition-colors"
                  >
                    Yes, clear
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded py-2 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          })() : (
            <div className="text-center">
              <button
                onClick={() => setConfirmClear(true)}
                disabled={isBlank}
                className="text-sm text-gray-500 hover:text-amber-400 underline underline-offset-2 transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:no-underline"
              >
                Clear world state
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-sm text-gray-400 w-28 flex-shrink-0">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
