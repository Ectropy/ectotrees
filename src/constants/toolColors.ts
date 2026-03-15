/**
 * Canonical per-tool color tokens.
 * Update a single entry here to change a tool's color everywhere in the UI.
 * Full Tailwind class strings are required so the compiler can statically
 * detect them during the build purge pass.
 */

export const SPAWN_COLOR = {
  text:        'text-blue-700',     // nav button active state (toolbar highlight)
  bg:          'bg-blue-700',       // primary "Set Timer" button background
  bgHover:     'hover:bg-blue-600', // primary button hover
  toolHover:   'hover:bg-blue-700', // small tool-button hover on WorldCard / WorldDetailView
  subtle:      'bg-blue-700/20',    // wheel-picker selected-row highlight tint
} as const;

export const TREE_COLOR = {
  text:        'text-green-700',     // nav button active state (toolbar highlight)
  bg:          'bg-green-700',       // primary "Confirm" button background in TreeInfoView
  bgHover:     'hover:bg-green-600', // primary button hover
  toolHover:   'hover:bg-green-700', // small tool-button hover on WorldCard / WorldDetailView
} as const;

export const DEAD_COLOR = {
  text:        'text-red-700',       // nav button active state (toolbar highlight)
  bg:          'bg-red-700',         // primary "Confirm Dead" button background
  bgHover:     'hover:bg-red-600',   // primary button hover
  toolHover:   'hover:bg-red-700',   // small tool-button hover on WorldCard / WorldDetailView
  alertBorder: 'border-red-800',     // warning card border in TreeDeadView
} as const;

/** World membership type colors */

export const P2P_COLOR = {
  text:   'text-yellow-200',                          // "P2P" type label in view headers
  badge:  'text-yellow-100 border border-yellow-500', // compact type badge in WorldCard
  border: 'border-yellow-500',                        // card border accent in WorldCard
} as const;

export const F2P_COLOR = {
  text:   'text-blue-200',                            // "F2P" type label in view headers
  badge:  'text-blue-200 border border-blue-500',     // compact type badge in WorldCard
  border: 'border-blue-500',                          // card border accent in WorldCard
} as const;

/** Tree / game-state display colors (StatusSection + WorldDetailView) */

export const TREE_STATE_COLOR = {
  dead:         'text-red-400',     // "R.I.P." tree-type label + dead countdown in StatusSection
  sapling:      'text-cyan-400',    // sapling type label while tree is a sapling
  matureAlive:  'text-emerald-400', // mature / alive tree type label
  deathTimer:   'text-orange-400',  // "Dies in ~" countdown while tree is alive
  saplingTimer: 'text-yellow-300',  // "Matures in ~" countdown while tree is a sapling
  spawnTimer:   'text-blue-300',    // "Next:" / "Spawn in" countdown before tree arrives
  rewardTimer:  'text-gray-300',    // "Clears in" reward-window countdown after tree dies
} as const;

/** Filter / sort chip UI states (SortFilterBar — FilterChip, TriStateChip, activeSummary pills) */

export const CHIP_COLOR = {
  inactive:   'bg-gray-700 text-gray-400 hover:bg-gray-600',         // off / unselected state for every chip type
  active:     'bg-blue-700 text-white font-semibold',                  // active boolean filter chip (Favorite, P2P, F2P)
  sortActive: 'bg-amber-700 text-white font-semibold',                 // active sort button (W#, Soonest, Favorite, Health)
  needs:      'bg-amber-500/30 text-amber-200 font-semibold ring-1 ring-amber-500',       // tri-state "Needs" — show worlds missing this info
  has:        'bg-emerald-500/30 text-emerald-200 font-semibold ring-1 ring-emerald-500', // tri-state "Has" — show worlds that have this info
} as const;

/** General UI text hierarchy */

export const TEXT_COLOR = {
  prominent: 'text-gray-100', // field values, form labels, setting names, confirmation messages — everything just below an h1
  muted:     'text-gray-400', // secondary labels, location hints, helper text, icon resting state
  faint:     'text-gray-500', // captions, helper text below inputs, counters, collapsed sort/filter link
  ghost:     'text-gray-600', // placeholder dashes, near-invisible decorative text
} as const;

/** Session connection state colors (SessionBar — status dot + clickable text) */

export const CONNECTION_COLOR = {
  connectedDot:     'bg-green-500',                       // status dot when connected
  connectedText:    'text-green-500 hover:text-green-400', // session label when connected
  connectingDot:    'bg-yellow-500 animate-pulse',         // animated dot while reconnecting
  connectingText:   'text-yellow-500 hover:text-yellow-400', // session label while reconnecting
  disconnectedDot:  'bg-red-500',                          // status dot when disconnected / error
  disconnectedText: 'text-red-500 hover:text-red-400',     // session label when disconnected
} as const;

type SessionStatus = 'connected' | 'connecting' | 'disconnected';

/** Pre-built status → dot color map (SessionBar + SessionView) */
export const STATUS_DOT_COLORS: Record<SessionStatus, string> = {
  connected:    CONNECTION_COLOR.connectedDot,
  connecting:   CONNECTION_COLOR.connectingDot,
  disconnected: CONNECTION_COLOR.disconnectedDot,
};

/** Pre-built status → text color map (SessionBar + SessionView) */
export const STATUS_TEXT_COLORS: Record<SessionStatus, string> = {
  connected:    CONNECTION_COLOR.connectedText,
  connecting:   CONNECTION_COLOR.connectingText,
  disconnected: CONNECTION_COLOR.disconnectedText,
};

/** Base classes for secondary (gray) action buttons.
 *  Add sizing (py-2 / py-2.5) and layout (flex-1, w-full, mt-6) per usage. */
export const BUTTON_SECONDARY = 'bg-gray-700 hover:bg-gray-600 text-white font-medium rounded transition-colors';
