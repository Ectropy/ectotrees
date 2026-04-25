import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { PanelLeft, PanelRight, Expand, X, Timer, TreeDeciduous, Skull, Settings, Copy, Check, Search, Map } from 'lucide-react';
import { PartyHatGlasses } from './components/icons/PartyHatGlasses';
import { SPAWN_COLOR, TREE_COLOR, DEAD_COLOR, TEXT_COLOR } from './constants/toolColors';
import worldsConfig from './data/worlds.json';
import { useWorldStates } from './hooks/useWorldStates';
import { useSession } from './hooks/useSession';
import { useStoredSet } from './hooks/useStoredSet';
import { useIsMobile } from './hooks/useIsMobile';
import { WorldCard } from './components/WorldCard';
import { SpawnTimerView } from './components/SpawnTimerView';
import { TreeInfoView } from './components/TreeInfoView';
import { TreeDeadView } from './components/TreeDeadView';
import { WorldDetailView } from './components/WorldDetailView';
import { SettingsView } from './components/SettingsView';
import { SessionJoinView } from './components/SessionJoinView';
import { SessionBar } from './components/SessionBar';
import { SessionView } from './components/SessionView';
import { SessionBrowserView } from './components/SessionBrowserView';
import { MapView } from './components/MapView';
import { TipTicker } from './components/TipTicker';
import { UpdateBanner } from './components/UpdateBanner';
import { SortFilterBar, DEFAULT_FILTERS } from './components/SortFilterBar';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from './components/ui/resizable';
import type { SortMode, Filters } from './components/SortFilterBar';
import type { WorldConfig, WorldStates } from './types';
import { buildDiscordMessage } from './lib/intelCopy';
import { validateSessionCode } from './lib/sessionUrl';
import { useSettings } from './hooks/useSettings';
import { useFilteredWorlds, isActive, loadSortPrefs, loadFilters, SORT_STORAGE_KEY, FILTER_STORAGE_KEY } from './hooks/useFilteredWorlds';
import { trackUiEvent, type UiPanel, type UiSidebarSide, type UiSurface } from './lib/analytics';
import { useCopyFeedback } from '@shared-browser/useCopyFeedback';

const worlds = worldsConfig.worlds as WorldConfig[];

type ActiveView =
  | { kind: 'grid' }
  | { kind: 'settings' }
  | { kind: 'session' }
  | { kind: 'session-join'; code: string }
  | { kind: 'browse' }
  | { kind: 'map' }
  | { kind: 'spawn' | 'tree' | 'dead' | 'detail'; worldId: number };

const APP_VERSION = __APP_VERSION__;
const APP_VERSION_DISPLAY = APP_VERSION.replace(/\+[0-9a-f]+$/, '');

// Sidebar panel IDs for layout persistence
const SIDEBAR_PANEL_ID = 'sidebar';
const GRID_PANEL_ID = 'grid';


export default function App() {
  const handleSessionLost = useCallback(() => {
    saveToLocalStorageRef.current();
  }, []);
  const { session, previewWorlds, syncChannel, createSession, createSessionAndRequestToken, joinSession, rejoinSession, leaveSession, previewJoin, confirmPreviewJoin, cancelPreview, dismissError, forkToManaged, joinManagedFork, createInvite, kickMember, banMember, renameMember, setMemberRole, transferOwnership, setAllowOpenJoin, openJoin, updateSessionSettings, requestIdentityToken, forkDismissed, dismissForkInvite } = useSession(handleSessionLost);
  const { worldStates, setSpawnTimer, setTreeInfo, updateTreeFields, updateHealth, reportLightning, markDead, clearWorld, saveToLocalStorage, lightningEvents, dismissLightningEvent, triggerLightningEvent } = useWorldStates(syncChannel);
  const saveToLocalStorageRef = useRef(saveToLocalStorage);
  // eslint-disable-next-line react-hooks/refs, react-hooks/immutability
  saveToLocalStorageRef.current = saveToLocalStorage;

  // Viewers in managed sessions cannot edit world state
  const canEdit = !session.managed || (session.memberRole !== 'viewer' && session.memberRole !== null);

  // Dev-only: expose trigger on window for manual testing
  const triggerLightningRef = useRef(triggerLightningEvent);
  // eslint-disable-next-line react-hooks/refs
  triggerLightningRef.current = triggerLightningEvent;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__triggerLightning =
      (worldId: number, kind?: string) => triggerLightningRef.current(worldId, (kind ?? 'lightning1') as import('./hooks/useWorldStates').LightningKind);
    return () => { delete (window as unknown as Record<string, unknown>).__triggerLightning; };
  }, []);
  const { set: favorites, toggle: toggleFavorite } = useStoredSet('evilTree_favorites');
  const { set: hiddenWorlds, toggle: toggleHidden } = useStoredSet('evilTree_hiddenWorlds');
  const { settings, updateSettings } = useSettings();
  const isMobile = useIsMobile();

  const worldStatesRef = useRef(worldStates);
  // eslint-disable-next-line react-hooks/refs
  worldStatesRef.current = worldStates;

  const handleCreateSession = useCallback(() => {
    return createSession(worldStatesRef.current);
  }, [createSession]);

  const handleLinkWithAlt1 = useCallback(() => {
    return createSessionAndRequestToken(worldStatesRef.current);
  }, [createSessionAndRequestToken]);

  const handleJoinSession = useCallback((code: string): boolean => {
    return joinSession(code);
  }, [joinSession]);

  const handleRequestSessionJoin = useCallback(async (code: string): Promise<boolean> => {
    const serverWorlds = await previewJoin(code);
    if (!serverWorlds) return false; // error already in session.error

    // Skip the join screen when it offers no decision: nothing to contribute and nothing being lost
    const localActive = Object.entries(worldStatesRef.current).filter(
      ([, s]) => s.treeStatus !== 'none' || s.nextSpawnTarget !== undefined
    );
    const hasContribute = localActive.some(([id]) => !(Number(id) in serverWorlds));
    const hasConflicts  = localActive.some(([id, s]) => {
      const sv = serverWorlds[Number(id)];
      return sv !== undefined
        && (s.treeStatus         !== sv.treeStatus
         || s.nextSpawnTarget    !== sv.nextSpawnTarget
         || s.treeType           !== sv.treeType
         || s.treeHint           !== sv.treeHint
         || s.treeExactLocation  !== sv.treeExactLocation
         || s.treeHealth         !== sv.treeHealth);
    });

    if (!hasContribute && !hasConflicts) {
      confirmPreviewJoin(code, undefined);
      // eslint-disable-next-line react-hooks/immutability
      setActiveView({ kind: 'session' });
      return true;
    }

    setActiveView({ kind: 'session-join', code });
    return true;
  }, [previewJoin, confirmPreviewJoin]);

  const handleJoinFromView = useCallback((code: string, localStates?: WorldStates): void => {
    confirmPreviewJoin(code, localStates);
    setActiveView({ kind: 'session' });
  }, [confirmPreviewJoin]);

  const activeLocalCount = useMemo(() => {
    return Object.values(worldStates).filter(
      s => s.treeStatus !== 'none' || s.nextSpawnTarget !== undefined
    ).length;
  }, [worldStates]);

  const handleLeaveSession = useCallback(() => {
    saveToLocalStorage();
    leaveSession();
  }, [saveToLocalStorage, leaveSession]);

  // Read the fragment code/token during state initialization so it survives React
  // Strict Mode's mount→unmount→remount cycle. URL is cleaned immediately here
  // (not in an effect) so it's gone by the time effects run.
  const [fragmentJoinTarget] = useState<string | null>(() => {
    const hash = window.location.hash;
    if (!hash) return null;
    const joinMatch = hash.match(/^#join=([A-Za-z0-9]+)$/);
    if (joinMatch) {
      const code = joinMatch[1].trim().toUpperCase();
      if (!validateSessionCode(code)) return null; // leave URL unchanged
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return code;
    }
    const inviteMatch = hash.match(/^#identity=([A-Za-z0-9]+)$/);
    if (inviteMatch) {
      const token = inviteMatch[1].trim().toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{12}$/.test(token)) return null; // leave URL unchanged
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return token;
    }
    return null;
  });

  // Trigger preview join for fragment URLs. useEffect with [] re-fires on each
  // Strict Mode remount — the first-mount attempt is cancelled by cleanup; the
  // second succeeds (fragmentJoinTarget is preserved in state, not re-read).
  useEffect(() => {
    if (!fragmentJoinTarget) return;
    handleRequestSessionJoin(fragmentJoinTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [activeView, setActiveView] = useState<ActiveView>(() => {
    const hasSession = localStorage.getItem('evilTree_sessionCode') || localStorage.getItem('evilTree_identityToken');
    if (!hasSession) {
      try {
        const raw = localStorage.getItem('evilTree_settings');
        const parsed = raw ? JSON.parse(raw) : null;
        const showBrowse = parsed?.showBrowseOnStartup !== false;
        if (showBrowse) return { kind: 'browse' };
      } catch { /* fall through */ }
    }
    return { kind: 'grid' };
  });
  const { copied: discordCopied, copy: copyDiscord } = useCopyFeedback(1500);
  const [sortMode, setSortMode] = useState<SortMode>(() => loadSortPrefs().mode);
  const [sortAsc, setSortAsc] = useState(() => loadSortPrefs().asc);
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [worldSearch, setWorldSearch] = useState('');
  const lastTrackedPanelKeyRef = useRef<string | null>(null);

  const getAnalyticsContext = useCallback((): { surface: UiSurface; sidebarSide: UiSidebarSide } => {
    const surface: UiSurface = settings.sidebarEnabled && !isMobile ? 'sidebar' : 'fullscreen';
    return {
      surface,
      sidebarSide: surface === 'sidebar' ? settings.sidebarSide : 'none',
    };
  }, [settings.sidebarEnabled, settings.sidebarSide, isMobile]);

  useEffect(() => {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ mode: sortMode, asc: sortAsc }));
  }, [sortMode, sortAsc]);

  useEffect(() => {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && worldSearch) {
        e.stopImmediatePropagation();
        setWorldSearch('');
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [worldSearch]);

  // Auto-open sidebar detail when search matches exactly one world
  const searchMatchWorldId = useMemo(() => {
    const s = worldSearch.trim();
    if (!s) return null;
    const match = worlds.find(w => String(w.id) === s);
    return match ? match.id : null;
  }, [worldSearch]);

  useEffect(() => {
    if (!settings.sidebarEnabled || isMobile) return;
    if (searchMatchWorldId !== null) {
      setActiveView(v =>
        v.kind === 'grid' || v.kind === 'detail' ? { kind: 'detail', worldId: searchMatchWorldId } : v
      );
    }
  }, [searchMatchWorldId, settings.sidebarEnabled, isMobile]);

  // Follow scout: when the linked scout changes worlds and followScout is enabled,
  // open the detail panel for that world.
  const prevScoutWorldRef = useRef<number | null>(null);
  const currentScoutWorld = session.scoutWorld;
  useEffect(() => {
    if (!settings.followScout) return;
    if (currentScoutWorld == null) return;
    if (currentScoutWorld === prevScoutWorldRef.current) return;
    prevScoutWorldRef.current = currentScoutWorld;
    setWorldSearch('');
    setActiveView({ kind: 'detail', worldId: currentScoutWorld });
  }, [currentScoutWorld, settings.followScout]);

  // New identity token = new Alt1 link; opt the user back in to following the scout.
  const prevIdentityTokenRef = useRef(session.identityToken);
  useEffect(() => {
    const prev = prevIdentityTokenRef.current;
    prevIdentityTokenRef.current = session.identityToken;
    if (session.identityToken !== null && session.identityToken !== prev && !settings.followScout) {
      updateSettings({ followScout: true });
    }
  }, [session.identityToken, settings.followScout, updateSettings]);

  const sortedFilteredWorlds = useFilteredWorlds(worlds, worldStates, favorites, hiddenWorlds, sortMode, sortAsc, filters, worldSearch);

  function handleOpenTool(worldId: number, tool: 'spawn' | 'tree' | 'dead') {
    const { surface, sidebarSide } = getAnalyticsContext();
    trackUiEvent('ui_tool_open', {
      panel: tool,
      tool,
      world_id: worldId,
      surface,
      sidebar_side: sidebarSide,
    });
    setActiveView({ kind: tool, worldId });
  }

  function handleOpenCard(worldId: number) {
    setActiveView({ kind: 'detail', worldId });
  }

  function handleBack() {
    if (activeView.kind !== 'grid') {
      const { surface, sidebarSide } = getAnalyticsContext();
      trackUiEvent('ui_nav_action', {
        panel: activeView.kind === 'map' ? 'grid' : activeView.kind,
        world_id: (activeView.kind !== 'settings' && activeView.kind !== 'session' && activeView.kind !== 'session-join' && activeView.kind !== 'browse' && activeView.kind !== 'map') ? activeView.worldId : undefined,
        surface,
        sidebar_side: sidebarSide,
        action: 'close_view',
        result: 'success',
      });
    }
    if (activeView.kind === 'session-join') cancelPreview();
    setActiveView({ kind: 'grid' });
  }

  function handleToolSubmitted(worldId: number) {
    if (useSidebar) {
      setActiveView({ kind: 'detail', worldId });
    } else {
      setActiveView({ kind: 'grid' });
    }
  }

  // Sidebar width — stored as a percentage (0-100) shared between left and right sides so
  // switching sides feels like moving the same panel, not opening a differently-sized one.
  // defaultSize must be a percentage string (not a pixel number) so the library can compute
  // the initial layout before the container is mounted in the DOM.
  const SIDEBAR_SIZE_KEY = 'ectotrees-sidebar-pct';
  const DEFAULT_SIDEBAR_PCT = 30;
  const [sidebarPct, setSidebarPct] = useState<number>(() => {
    const stored = localStorage.getItem(SIDEBAR_SIZE_KEY);
    const parsed = Number(stored);
    return Number.isFinite(parsed) && parsed > 5 && parsed < 90 ? parsed : DEFAULT_SIDEBAR_PCT;
  });
  // onLayoutChanged fires after the user finishes dragging; Layout = { [panelId]: pct(0-100) }
  const handleLayoutChanged = useCallback((layout: Record<string, number>) => {
    const pct = layout[SIDEBAR_PANEL_ID];
    if (pct !== undefined && Number.isFinite(pct) && pct > 5) {
      setSidebarPct(pct);
      localStorage.setItem(SIDEBAR_SIZE_KEY, String(pct));
    }
  }, []);

  // Whether to render sidebar mode (desktop + enabled + a view is open)
  const useSidebar = settings.sidebarEnabled && !isMobile && activeView.kind !== 'grid';
  // Whether a non-grid panel is open in fullscreen (mobile, or sidebar disabled).
  // Fullscreen renders inside the main layout so header + session bar stay visible;
  // the sort/filter bar is hidden because the grid is hidden.
  const isFullscreenPanel = !useSidebar && activeView.kind !== 'grid';

  useEffect(() => {
    if (activeView.kind === 'grid') return;
    if (activeView.kind === 'map') return; // PoC: skip analytics until map is promoted to UiPanel

    const panel = activeView.kind as UiPanel;
    const worldId = (activeView.kind !== 'settings' && activeView.kind !== 'session' && activeView.kind !== 'session-join' && activeView.kind !== 'browse') ? activeView.worldId : undefined;
    const surface: UiSurface = useSidebar ? 'sidebar' : 'fullscreen';
    const sidebarSide: UiSidebarSide = useSidebar ? settings.sidebarSide : 'none';
    const key = `${panel}:${worldId ?? 'none'}:${surface}:${sidebarSide}`;

    // Dedupes strict-mode and no-op rerenders so each transition is tracked once.
    if (lastTrackedPanelKeyRef.current === key) return;
    lastTrackedPanelKeyRef.current = key;

    trackUiEvent('ui_panel_open', {
      panel,
      world_id: worldId,
      surface,
      sidebar_side: sidebarSide,
    });
  }, [activeView, useSidebar, settings.sidebarSide]);

  // If a viewer somehow lands on an edit tool view (e.g. role changed mid-session), redirect to detail
  useEffect(() => {
    if (!canEdit && (activeView.kind === 'spawn' || activeView.kind === 'tree' || activeView.kind === 'dead')) {
      setActiveView({ kind: 'detail', worldId: (activeView as { worldId: number }).worldId });
    }
  }, [canEdit, activeView]);

  useEffect(() => {
    if (activeView.kind === 'browse' && session.code) {
      setActiveView({ kind: 'session' });
    }
  }, [activeView.kind, session.code]);

  const worldNavProp = activeView.kind !== 'grid' && activeView.kind !== 'settings' && activeView.kind !== 'session' && activeView.kind !== 'session-join' && activeView.kind !== 'browse' && activeView.kind !== 'map'
    ? { activeKind: activeView.kind, canEdit, onNavigate: (kind: 'detail' | 'spawn' | 'tree' | 'dead') => setActiveView({ kind, worldId: (activeView as { worldId: number }).worldId }) }
    : undefined;

  // Render the current tool/detail/settings view component
  function renderViewContent() {
    if (activeView.kind === 'settings')
      return <SettingsView settings={settings} onUpdateSettings={updateSettings} onBack={handleBack} />;

    if (activeView.kind === 'map')
      return <MapView />;

    if (activeView.kind === 'browse')
      return <SessionBrowserView
        session={session}
        activeLocalCount={activeLocalCount}
        onCreateSession={handleCreateSession}
        onJoinSession={handleJoinSession}
        onRequestSessionJoin={handleRequestSessionJoin}
        onOpenJoin={openJoin}
        onDismissError={dismissError}
        showOnStartup={settings.showBrowseOnStartup}
        onShowOnStartupChange={v => updateSettings({ showBrowseOnStartup: v })}
        onSessionStarted={() => setActiveView({ kind: 'session' })}
      />;

    if (activeView.kind === 'session') {
      if (!session.code) return <SessionBrowserView
        session={session}
        activeLocalCount={activeLocalCount}
        onCreateSession={handleCreateSession}
        onJoinSession={handleJoinSession}
        onRequestSessionJoin={handleRequestSessionJoin}
        onOpenJoin={openJoin}
        onDismissError={dismissError}
        showOnStartup={settings.showBrowseOnStartup}
        onShowOnStartupChange={v => updateSettings({ showBrowseOnStartup: v })}
        onSessionStarted={() => setActiveView({ kind: 'session' })}
      />;
      return <SessionView
        session={session}
        onRejoinSession={rejoinSession}
        onLeaveSession={handleLeaveSession}
        onDismissError={dismissError}
        onForkToManaged={forkToManaged}
        onJoinManagedFork={joinManagedFork}
        onCreateInvite={createInvite}
        onKickMember={kickMember}
        onBanMember={banMember}
        onRenameMember={renameMember}
        onSetMemberRole={setMemberRole}
        onTransferOwnership={transferOwnership}
        onSetAllowOpenJoin={setAllowOpenJoin}
        onUpdateSessionSettings={updateSessionSettings}
        onRequestIdentityToken={requestIdentityToken}
        onBack={handleBack}
        followScout={settings.followScout}
        onFollowScoutChange={v => updateSettings({ followScout: v })}
        forkDismissed={forkDismissed}
        onDismissFork={dismissForkInvite}
      />;
    }

    if (activeView.kind === 'session-join')
      return <SessionJoinView
        codeOrToken={activeView.code}
        localWorldStates={worldStates}
        serverWorlds={previewWorlds ?? {}}
        onJoin={(localStates?: WorldStates) => handleJoinFromView(activeView.code, localStates)}
        onCancel={handleBack}
      />;

    if (activeView.kind !== 'grid') {
      const { worldId } = activeView;
      const world = worlds.find(w => w.id === worldId)!;

      if (activeView.kind === 'spawn')
        return <SpawnTimerView
          world={world}
          onSubmit={(ms, info) => {
            const { surface, sidebarSide } = getAnalyticsContext();
            trackUiEvent('ui_tool_submit', {
              panel: 'spawn',
              tool: 'spawn',
              world_id: worldId,
              surface,
              sidebar_side: sidebarSide,
              action: 'set_timer',
              result: 'success',
            });
            setSpawnTimer(worldId, ms, info);
            handleToolSubmitted(worldId);
          }}
          onBack={handleBack}
        />;
      if (activeView.kind === 'tree') {
        const currentState = worldStates[worldId] ?? { treeStatus: 'none' as const };
        const existingState = (currentState.treeStatus === 'sapling' || currentState.treeStatus === 'mature' || currentState.treeStatus === 'alive')
          ? currentState : undefined;
        return <TreeInfoView
          world={world}
          existingState={existingState}
          onSubmit={(info, source = 'default') => {
            const { surface, sidebarSide } = getAnalyticsContext();
            trackUiEvent('ui_tool_submit', {
              panel: 'tree',
              tool: 'tree',
              world_id: worldId,
              surface,
              sidebar_side: sidebarSide,
              action: source === 'override' ? 'override_tree_info' : 'save_tree_info',
              result: 'success',
            });
            setTreeInfo(worldId, info);
            handleToolSubmitted(worldId);
          }}
          onUpdate={(fields) => {
            const { surface, sidebarSide } = getAnalyticsContext();
            trackUiEvent('ui_tool_submit', {
              panel: 'tree',
              tool: 'tree',
              world_id: worldId,
              surface,
              sidebar_side: sidebarSide,
              action: 'update_tree_info',
              result: 'success',
            });
            updateTreeFields(worldId, fields);
            handleToolSubmitted(worldId);
          }}
          onBack={handleBack}
        />;
      }
      if (activeView.kind === 'dead')
        return <TreeDeadView
          world={world}
          onConfirm={() => {
            const { surface, sidebarSide } = getAnalyticsContext();
            trackUiEvent('ui_tool_submit', {
              panel: 'dead',
              tool: 'dead',
              world_id: worldId,
              surface,
              sidebar_side: sidebarSide,
              action: 'mark_dead',
              result: 'confirm',
            });
            markDead(worldId);
            handleToolSubmitted(worldId);
          }}
          onBack={handleBack}
        />;
      if (activeView.kind === 'detail')
        return <WorldDetailView
          key={worldId}
          world={world}
          state={worldStates[worldId] ?? { treeStatus: 'none' }}
          isFavorite={favorites.has(worldId)}
          isHidden={hiddenWorlds.has(worldId)}
          onToggleFavorite={() => toggleFavorite(worldId)}
          onToggleHidden={() => toggleHidden(worldId)}
          onClear={() => { clearWorld(worldId); handleBack(); }}
          onUpdateHealth={(health) => updateHealth(worldId, health)}
          onReportLightning={(health) => reportLightning(worldId, health)}
          onUpdateFields={(fields) => updateTreeFields(worldId, fields)}
          onBack={handleBack}
          onOpenTool={(tool) => handleOpenTool(worldId, tool)}
          lightningEvent={lightningEvents.get(worldId)}
          onDismissLightning={() => dismissLightningEvent(worldId)}
          effectsLightning={settings.effectsLightning}
          effectsSparks={settings.effectsSparks}
          canEdit={canEdit}
        />;
    }
    return null;
  }

  // World grid (shared between grid-only and sidebar modes)
  const worldGrid = sortedFilteredWorlds.length === 0 ? (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
      <p className="text-sm">No worlds match the current filters. =(</p>
      <button
        onClick={() => setFilters(DEFAULT_FILTERS)}
        className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
      >
        Clear filters
      </button>
    </div>
  ) : (
    <div
      className="flex-1 overflow-visible"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))',
        gap: '3px',
        alignContent: 'start',
      }}
    >
      {sortedFilteredWorlds.map(world => (
        <WorldCard
          key={world.id}
          world={world}
          state={worldStates[world.id] ?? { treeStatus: 'none' }}
          isFavorite={favorites.has(world.id)}
          isHidden={hiddenWorlds.has(world.id)}
          onToggleFavorite={() => toggleFavorite(world.id)}
          onToggleHidden={() => toggleHidden(world.id)}
          onCardClick={() => handleOpenCard(world.id)}
          onOpenTool={(tool) => handleOpenTool(world.id, tool)}
          lightningEvent={lightningEvents.get(world.id)}
          onDismissLightning={() => dismissLightningEvent(world.id)}
          effectsLightning={settings.effectsLightning}
          effectsSparks={settings.effectsSparks}
          isActiveWorld={'worldId' in activeView && activeView.worldId === world.id}
          isRecentOwnSubmission={session.recentOwnWorldId === world.id}
          canEdit={canEdit}
        />
      ))}
    </div>
  );

  return (
    // Outer shell is pinned to the viewport — nothing scrolls at the page level
    <div className="flex flex-col h-screen">
      <div className="flex flex-col flex-1 min-h-0 p-1.5 gap-1.5">
        <header className="flex items-center justify-between px-2 py-1 bg-gray-800 rounded flex-shrink-0">
          <h1 className={`text-base font-bold ${TEXT_COLOR.prominent} tracking-wide`}>
            Ectotrees
            <small className="hidden sm:inline ms-2 text-xs font-light">Turning Evil Trees into dead trees.</small>
          </h1>
          <div className="flex items-center gap-4">
            <div className="relative flex items-center">
              <Search className={`absolute left-1.5 h-3 w-3 ${TEXT_COLOR.muted} pointer-events-none`} />
              <input
                type="text"
                inputMode="numeric"
                value={worldSearch}
                onChange={e => setWorldSearch(e.target.value.replace(/\D/g, '').slice(0, 3))}
                placeholder="World"
                className={`w-20 pl-5 pr-5 py-0.5 text-xs bg-gray-700 ${TEXT_COLOR.prominent} rounded border border-gray-600 focus:border-gray-400 focus:outline-none placeholder:text-gray-400`}
                aria-label="Search worlds by number"
              />
              {worldSearch && (
                <button
                  onClick={() => setWorldSearch('')}
                  className={`absolute right-1 ${TEXT_COLOR.prominent} hover:${TEXT_COLOR.muted}`}
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <span className={`flex items-center gap-1 text-xs ${TEXT_COLOR.prominent}`}>
              <TreeDeciduous className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{worlds.filter(w => isActive(worldStates[w.id] ?? { treeStatus: 'none' })).length}<span className="hidden sm:inline">/{worlds.length} worlds scouted</span></span>
            </span>
            {(() => {
              const intelWorlds = sortedFilteredWorlds.filter(w => {
                const s = worldStates[w.id] ?? { treeStatus: 'none' as const };
                return s.treeStatus !== 'none' || s.nextSpawnTarget !== undefined;
              });
              const hasIntel = intelWorlds.length > 0;
              return (
                <button
                  disabled={!hasIntel}
                  onClick={() => {
                    const msg = buildDiscordMessage(intelWorlds, worldStates);
                    copyDiscord(msg);
                  }}
                  className={`flex items-center gap-1 transition-colors text-base leading-none ${hasIntel ? `${TEXT_COLOR.prominent} hover:${TEXT_COLOR.muted}` : `${TEXT_COLOR.ghost} cursor-not-allowed`}`}
                  title="Copy intel to clipboard in Discord-friendly format"
                  aria-label="Copy intel to clipboard"
                >
                  {discordCopied
                    ? <><Check className="h-4 w-4 text-green-400" /><span className="hidden sm:inline text-green-400 text-xs">Copied!</span></>
                    : <><Copy className="h-4 w-4" /><span className="hidden sm:inline text-xs">Copy visible intel</span></>
                  }
                </button>
              );
            })()}
            <button
              onClick={() => setActiveView({ kind: 'map' })}
              className={`${TEXT_COLOR.prominent} hover:${TEXT_COLOR.muted} transition-colors text-base leading-none`}
              title="Map (PoC)"
              aria-label="Open map"
            ><Map className="h-4 w-4" /></button>
            <button
              onClick={() => {
                const { surface, sidebarSide } = getAnalyticsContext();
                trackUiEvent('ui_nav_action', {
                  panel: 'settings',
                  surface,
                  sidebar_side: sidebarSide,
                  action: 'open_settings',
                  result: 'success',
                });
                setActiveView({ kind: 'settings' });
              }}
              className={`${TEXT_COLOR.prominent} hover:${TEXT_COLOR.muted} transition-colors text-base leading-none`}
              title="Settings"
              aria-label="Open settings"
            ><Settings className="h-4 w-4" /></button>
          </div>
        </header>

        <SessionBar
          session={session}
          onCreateSession={handleCreateSession}
          onRejoinSession={rejoinSession}
          onLeaveSession={handleLeaveSession}
          onDismissError={dismissError}
          onOpenSession={() => setActiveView({ kind: 'session' })}
          onRequestIdentityToken={requestIdentityToken}
          onLinkWithAlt1={handleLinkWithAlt1}
          onOpenBrowser={() => setActiveView({ kind: 'browse' })}
          forkDismissed={forkDismissed}
        />

        {!isFullscreenPanel && (
          <SortFilterBar
            sortMode={sortMode}
            setSortMode={setSortMode}
            sortAsc={sortAsc}
            setSortAsc={setSortAsc}
            filters={filters}
            setFilters={setFilters}
          />
        )}

        {useSidebar ? (
          <ResizablePanelGroup
            orientation="horizontal"
            onLayoutChanged={handleLayoutChanged}
            key={settings.sidebarSide}
            className="flex-1 min-h-0"
          >
            {settings.sidebarSide === 'left' && (
              <>
                <ResizablePanel id={SIDEBAR_PANEL_ID} defaultSize={`${sidebarPct}%`} minSize="365px">
                  <SidebarWrapper side={settings.sidebarSide} onChangeSide={side => updateSettings({ sidebarSide: side })} onExpand={() => updateSettings({ sidebarEnabled: false })} onClose={handleBack} worldNav={worldNavProp}>
                    {renderViewContent()}
                  </SidebarWrapper>
                </ResizablePanel>
                <ResizableHandle />
              </>
            )}

            <ResizablePanel id={GRID_PANEL_ID} minSize="300px">
              <div className="h-full overflow-y-auto">
                <main className="p-0.5">
                  {worldGrid}
                </main>
              </div>
            </ResizablePanel>

            {settings.sidebarSide === 'right' && (
              <>
                <ResizableHandle />
                <ResizablePanel id={SIDEBAR_PANEL_ID} defaultSize={`${sidebarPct}%`} minSize="365px">
                  <SidebarWrapper side={settings.sidebarSide} onChangeSide={side => updateSettings({ sidebarSide: side })} onExpand={() => updateSettings({ sidebarEnabled: false })} onClose={handleBack} worldNav={worldNavProp}>
                    {renderViewContent()}
                  </SidebarWrapper>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        ) : isFullscreenPanel ? (
          <FullscreenWrapper
            onClose={handleBack}
            showDockControls={!isMobile}
            onDockLeft={() => updateSettings({ sidebarEnabled: true, sidebarSide: 'left' })}
            onDockRight={() => updateSettings({ sidebarEnabled: true, sidebarSide: 'right' })}
            worldNav={worldNavProp}
          >
            {renderViewContent()}
          </FullscreenWrapper>
        ) : (
          // Grid only: scrolls within remaining space
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
            {worldGrid}
          </div>
        )}
      </div>

      <UpdateBanner />

      {/* Footer is a direct flex child of h-screen — always anchored to the bottom */}
      <footer className="px-2 py-1 bg-gray-800 flex-shrink-0">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          {settings.showTipTicker && <TipTicker />}
          <span className="text-[10px] text-gray-200 leading-none flex-shrink-0 text-center sm:text-left">Ectotrees v{APP_VERSION_DISPLAY} • <a className="underline hover:text-blue-300" href='https://github.com/Ectropy/ectotrees' target='_blank'>View on GitHub</a></span>
        </div>
      </footer>
    </div>
  );
}

const NAV_ITEMS = [
  { kind: 'detail' as const, icon: PartyHatGlasses, label: 'View',  activeColor: 'text-gray-100',  hoverBg: 'hover:bg-white/10',     underline: 'border-b border-gray-100'  },
  { kind: 'spawn'  as const, icon: Timer,           label: 'Timer', activeColor: SPAWN_COLOR.text,  hoverBg: SPAWN_COLOR.borderHover, underline: SPAWN_COLOR.underline },
  { kind: 'tree'   as const, icon: TreeDeciduous,   label: 'Tree',  activeColor: TREE_COLOR.text,   hoverBg: TREE_COLOR.borderHover,  underline: TREE_COLOR.underline  },
  { kind: 'dead'   as const, icon: Skull,           label: 'Dead',  activeColor: DEAD_COLOR.text,   hoverBg: DEAD_COLOR.borderHover,  underline: DEAD_COLOR.underline  },
];
// Viewers in managed sessions only see the detail nav button — edit tools are hidden
const VIEWER_NAV_ITEMS = NAV_ITEMS.filter(item => item.kind === 'detail');

function NavButton({ item, isActive, onClick, variant }: {
  item: typeof NAV_ITEMS[number];
  isActive: boolean;
  onClick: () => void;
  variant: 'sidebar' | 'fullscreen';
}) {
  const { icon: Icon, label, activeColor, hoverBg, underline } = item;
  const activeClass = `${activeColor} ${hoverBg} ${underline}`;
  const inactiveClass = `text-gray-400 hover:text-gray-200 ${hoverBg}`;
  const sizeClass = variant === 'sidebar'
    ? 'px-1.5 py-1'
    : 'px-2 py-2 sm:px-1.5 sm:py-1';
  const iconClass = variant === 'sidebar'
    ? 'h-3.5 w-3.5 flex-shrink-0'
    : 'h-5 w-5 sm:h-3.5 sm:w-3.5 flex-shrink-0';
  return (
    <button
      onClick={onClick}
      title={label}
      className={`${sizeClass} ${isActive ? 'rounded-t' : 'rounded'} flex items-center gap-1 transition-colors ${isActive ? activeClass : inactiveClass}`}
    >
      <Icon className={iconClass} />
      <span className="hidden sm:inline text-[11px]">{label}</span>
    </button>
  );
}

function SidebarWrapper({
  side,
  onChangeSide,
  onExpand,
  onClose,
  worldNav,
  children,
}: {
  side: 'left' | 'right';
  onChangeSide: (side: 'left' | 'right') => void;
  onExpand: () => void;
  onClose: () => void;
  worldNav?: { activeKind: 'detail' | 'spawn' | 'tree' | 'dead'; canEdit: boolean; onNavigate: (kind: 'detail' | 'spawn' | 'tree' | 'dead') => void };
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full bg-gray-900 border-gray-700" style={{ borderLeftWidth: side === 'right' ? 0 : undefined }}>
      {/* Toolbar */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-2 py-1 border-b border-gray-700 flex-shrink-0">
        {/* Left: dock + expand */}
        <div className="flex items-center gap-1">
          {side === 'right' ? (
            <button
              onClick={() => onChangeSide('left')}
              title="Dock left"
              className="p-1 rounded transition-colors text-gray-400 hover:text-gray-200 hover:bg-gray-700"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => onChangeSide('right')}
              title="Dock right"
              className="p-1 rounded transition-colors text-gray-400 hover:text-gray-200 hover:bg-gray-700"
            >
              <PanelRight className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onExpand}
            title="Open fullscreen"
            className="p-1 rounded transition-colors text-gray-400 hover:text-gray-200 hover:bg-gray-700"
          >
            <Expand className="h-4 w-4" />
          </button>
        </div>
        {/* Center: world nav buttons */}
        <div className="flex items-center justify-center gap-0.5">
          {worldNav && (worldNav.canEdit ? NAV_ITEMS : VIEWER_NAV_ITEMS).map(item => (
            <NavButton
              key={item.kind}
              item={item}
              isActive={worldNav.activeKind === item.kind}
              onClick={() => worldNav.onNavigate(item.kind)}
              variant="sidebar"
            />
          ))}
        </div>
        {/* Right: close */}
        <div className="flex items-center justify-end">
          <button
            onClick={onClose}
            title="Close"
            className="flex items-center gap-1 p-1 rounded transition-colors text-gray-400 hover:text-gray-200 hover:bg-gray-700"
          >
            <X className="h-4 w-4" />
            <span className="text-xs">Close</span>
          </button>
        </div>
      </div>
      {/* View content — scrollable. [&>*]:!min-h-full overrides the min-h-screen on view
          root divs so they fill the panel height instead of forcing 100vh */}
      <div className="flex-1 overflow-y-auto [&>*]:!min-h-full">
        {children}
      </div>
    </div>
  );
}

function FullscreenWrapper({
  onClose,
  showDockControls,
  onDockLeft,
  onDockRight,
  worldNav,
  children,
}: {
  onClose: () => void;
  showDockControls: boolean;
  onDockLeft: () => void;
  onDockRight: () => void;
  worldNav?: { activeKind: 'detail' | 'spawn' | 'tree' | 'dead'; canEdit: boolean; onNavigate: (kind: 'detail' | 'spawn' | 'tree' | 'dead') => void };
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="bg-gray-900 border-b border-gray-700 flex-shrink-0 px-4 sm:px-6 py-1">
        <div className="max-w-lg mx-auto relative flex items-center">
          {/* Left: dock buttons (desktop only — never rendered on mobile) */}
          {showDockControls && (
            <div className="flex items-center gap-1">
              <button
                onClick={onDockLeft}
                title="Dock left"
                className="p-1 rounded transition-colors text-gray-400 hover:text-gray-200 hover:bg-gray-700"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
              <button
                onClick={onDockRight}
                title="Dock right"
                className="p-1 rounded transition-colors text-gray-400 hover:text-gray-200 hover:bg-gray-700"
              >
                <PanelRight className="h-4 w-4" />
              </button>
            </div>
          )}
          {/* Nav buttons: left-aligned on mobile, absolutely centered on desktop */}
          <div className="flex items-center gap-0.5 sm:absolute sm:left-1/2 sm:-translate-x-1/2">
            {worldNav && (worldNav.canEdit ? NAV_ITEMS : VIEWER_NAV_ITEMS).map(item => (
              <NavButton
                key={item.kind}
                item={item}
                isActive={worldNav.activeKind === item.kind}
                onClick={() => worldNav.onNavigate(item.kind)}
                variant="fullscreen"
              />
            ))}
          </div>
          {/* Close: always pushed to the right */}
          <button
            onClick={onClose}
            title="Close"
            className="ml-auto flex items-center gap-1.5 p-2 sm:p-1 rounded transition-colors text-gray-400 hover:text-gray-200 hover:bg-gray-700"
          >
            <X className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="text-xs">Close</span>
          </button>
        </div>
      </div>
      {/* [&>*]:!min-h-full overrides min-h-screen on view root divs */}
      <div className="flex-1 overflow-y-auto [&>*]:!min-h-full">
        {children}
      </div>
    </div>
  );
}
