import { useState } from 'react';
import type { WorldConfig, WorldState, TreeFieldsPayload } from '../types';
import type { TreeType } from '../constants/evilTree';
import { TREE_TYPES, TREE_TYPE_LABELS, LOCATION_HINTS, SAPLING_MATURE_MS, ALIVE_DEAD_MS, DEAD_CLEAR_MS, formatMs } from '../constants/evilTree';
import { HealthButtonGrid } from './HealthButtonGrid';
import { LightningEffect } from './LightningEffect';
import { SparkEffect } from './SparkEffect';

interface Props {
  world: WorldConfig;
  state: WorldState;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClear: () => void;
  onUpdateHealth: (health: number | undefined) => void;
  onUpdateFields: (fields: TreeFieldsPayload) => void;
  onBack: () => void;
  onOpenTool: (tool: 'spawn' | 'tree' | 'dead') => void;
  lightningEvent?: { kind: string; seq: number };
  onDismissLightning?: () => void;
  effectsLightning?: boolean;
  effectsSparks?: boolean;
}

type EditingField = 'treeType' | 'treeHint' | 'treeExactLocation' | null;

export function WorldDetailView({ world, state, isFavorite, onToggleFavorite, onClear, onUpdateHealth, onUpdateFields, onBack, onOpenTool, lightningEvent, onDismissLightning, effectsLightning, effectsSparks }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [editingField, setEditingField] = useState<EditingField>(null);
  const isP2P = world.type === 'P2P';
  const isBlank = state.treeStatus === 'none' && !state.nextSpawnTarget;
  const hasActiveTree = state.treeStatus === 'sapling' || state.treeStatus === 'mature' || state.treeStatus === 'alive';
  const isDeadTree = state.treeStatus === 'dead';
  const hasSpawnTimer = state.nextSpawnTarget !== undefined;

  const inlineSelectClass = 'bg-gray-700 text-white text-xs rounded px-1 py-0.5 border border-gray-500 focus:outline-none';
  const inlineInputClass = 'bg-gray-700 text-white text-xs rounded px-1 py-0.5 border border-gray-500 focus:outline-none';

  function resolveExactLocationFromHint(newHint: string): string | undefined {
    const match = LOCATION_HINTS.find(lh => lh.hint === newHint);
    return match?.locations.length === 1 ? match.locations[0] : undefined;
  }

  function commitField(fields: TreeFieldsPayload) {
    onUpdateFields(fields);
    setEditingField(null);
  }
  const now = Date.now();

  return (
    <div className="min-h-screen bg-gray-900 p-4 sm:p-6" style={{ position: 'relative', isolation: 'isolate' }}>
      {lightningEvent && (effectsLightning ?? true) && (
        <LightningEffect key={lightningEvent.seq} onComplete={onDismissLightning ?? (() => {})} />
      )}
      {state.treeStatus === 'dead' && (effectsSparks ?? true) && <SparkEffect />}
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
            <h1 className="text-2xl font-bold text-white mb-1">
              W{world.id} Status
              <button
                onClick={onToggleFavorite}
                className={`ml-2 text-lg transition-colors ${
                  isFavorite ? 'text-amber-400' : 'text-gray-600 hover:text-gray-400'
                }`}
              >
                {isFavorite ? '★' : '☆'}
              </button>
            </h1>
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
                {(state.treeType || hasActiveTree || state.treeStatus === 'dead') && (
                  <Row label="Tree type">
                    {state.treeStatus === 'dead' ? (
                      <span className="text-red-400">
                        {state.treeType && state.treeType !== 'sapling' && state.treeType !== 'mature'
                          ? `Dead (${TREE_TYPE_LABELS[state.treeType]})`
                          : 'Dead'}
                      </span>
                    ) : editingField === 'treeType' ? (
                      <span className="flex items-center gap-1">
                        <select
                          autoFocus
                          defaultValue={state.treeType ?? 'tree'}
                          onChange={e => commitField({ treeType: e.target.value as TreeType })}
                          className={inlineSelectClass}
                        >
                          {TREE_TYPES.map(t => (
                            <option key={t} value={t}>{TREE_TYPE_LABELS[t]}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => setEditingField(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
                      </span>
                    ) : hasActiveTree ? (
                      <button type="button" onClick={() => setEditingField('treeType')} className="flex items-center gap-1.5 hover:text-blue-300 transition-colors cursor-pointer" aria-label="Edit tree type">
                        <span className="text-gray-100">{state.treeType ? TREE_TYPE_LABELS[state.treeType] : '—'}</span>
                        <span className="text-xs text-gray-500 leading-none">✎</span>
                      </button>
                    ) : (
                      <span className="text-gray-100">{state.treeType ? TREE_TYPE_LABELS[state.treeType] : '—'}</span>
                    )}
                  </Row>
                )}

                {(state.treeHint || hasActiveTree || hasSpawnTimer || isDeadTree) && (
                  <Row label="Hint">
                    {editingField === 'treeHint' ? (
                      <span className="flex items-center gap-1">
                        <select
                          autoFocus
                          defaultValue={state.treeHint ?? ''}
                          onChange={e => {
                            const newHint = e.target.value;
                            if (!newHint) { setEditingField(null); return; }
                            commitField({
                              treeHint: newHint,
                              treeExactLocation: resolveExactLocationFromHint(newHint),
                            });
                          }}
                          className={inlineSelectClass}
                        >
                          <option value="">— select hint —</option>
                          {LOCATION_HINTS.map(lh => (
                            <option key={lh.hint} value={lh.hint}>{lh.hint}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => setEditingField(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
                      </span>
                    ) : (hasActiveTree || hasSpawnTimer || isDeadTree) ? (
                      <button type="button" onClick={() => setEditingField('treeHint')} className="flex items-center gap-1.5 hover:text-blue-300 transition-colors cursor-pointer" aria-label="Edit location hint">
                        <span className="text-gray-100">{state.treeHint ?? '—'}</span>
                        <span className="text-xs text-gray-500 leading-none">✎</span>
                      </button>
                    ) : (
                      <span className="text-gray-100">{state.treeHint ?? '—'}</span>
                    )}
                  </Row>
                )}

                {(state.treeHint || state.treeExactLocation || isDeadTree) && (() => {
                  const availableLocations = LOCATION_HINTS.find(lh => lh.hint === state.treeHint)?.locations ?? [];
                  return (
                    <Row label="Exact location">
                      {editingField === 'treeExactLocation' ? (
                        <span className="flex items-center gap-1">
                          {availableLocations.length > 0 ? (
                            <select
                              autoFocus
                              defaultValue={state.treeExactLocation ?? ''}
                              onChange={e => commitField({ treeExactLocation: e.target.value || undefined })}
                              className={inlineSelectClass}
                            >
                              <option value="">— unknown —</option>
                              {availableLocations.map(loc => (
                                <option key={loc} value={loc}>{loc}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              autoFocus
                              type="text"
                              defaultValue={state.treeExactLocation ?? ''}
                              onBlur={e => commitField({ treeExactLocation: e.target.value.trim() || undefined })}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  commitField({ treeExactLocation: (e.currentTarget as HTMLInputElement).value.trim() || undefined });
                                }
                                if (e.key === 'Escape') setEditingField(null);
                              }}
                              placeholder="Type exact location"
                              className={inlineInputClass}
                            />
                          )}
                          <button type="button" onClick={() => setEditingField(null)} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
                        </span>
                      ) : (hasActiveTree || hasSpawnTimer || isDeadTree) ? (
                        <button type="button" onClick={() => setEditingField('treeExactLocation')} className="flex items-center gap-1.5 hover:text-blue-300 transition-colors cursor-pointer" aria-label="Edit exact location">
                          <span className="text-gray-100">{state.treeExactLocation ?? '—'}</span>
                          <span className="text-xs text-gray-500 leading-none">✎</span>
                        </button>
                      ) : (
                        <span className="text-gray-100">{state.treeExactLocation ?? '—'}</span>
                      )}
                    </Row>
                  )
                })()}

                {state.treeHealth !== undefined && (
                  <Row label="Health">
                    <span className="text-gray-100">{state.treeHealth}%</span>
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
                })()}
              </dl>
            )}
          </div>

          {/* Reward info (dead trees) */}
          {state.treeStatus === 'dead' && (
            <div className="bg-gray-800 border border-green-800 rounded p-4">
              <p className="text-sm text-green-300 font-semibold mb-1">Rewards available</p>
              <p className="text-xs text-gray-300">
                If you participated in killing this tree, you can collect rewards from it before it clears.
              </p>
              <a
                href="https://runescape.wiki/w/Evil_Tree#Rewards"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-xs text-blue-400 hover:text-blue-300 underline"
              >
                Learn more about rewards on the wiki →
              </a>
            </div>
          )}

          {/* Health update (alive trees only) */}
          {(state.treeStatus === 'alive' || state.treeStatus === 'mature') && (
            <div className="bg-gray-800 border border-gray-700 rounded p-4">
              <p className="text-xs text-gray-400 font-semibold mb-2">Update health</p>
              <HealthButtonGrid
                value={state.treeHealth}
                onChange={onUpdateHealth}
              />
              <p className="text-xs text-gray-500 mt-2">
                Tap to update, tap again to clear. Won't reset timers.
              </p>
            </div>
          )}

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
