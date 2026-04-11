/**
 * Canonical per-tool color tokens.
 * Update a single entry here to change a tool's color everywhere in the UI.
 * Full Tailwind class strings are required so the compiler can statically
 * detect them during the build purge pass.
 */

/** Shared label color for all bordered action buttons */
export const BUTTON_LABEL_COLOR = 'text-gray-300';

export const SPAWN_COLOR = {
  text:              'text-blue-300',          // nav button active state (toolbar highlight)
  border:            'border border-blue-300', // bordered button style
  label:             BUTTON_LABEL_COLOR,        // label color on bordered buttons
  borderHover:       'hover:bg-blue-300/20',   // subtle fill on hover for bordered button
  borderHoverBorder: 'hover:border-blue-300',  // border color on hover for tool buttons
  underline:         'border-b border-blue-300', // active nav button underline indicator
  subtle:            'bg-blue-700/20',         // wheel-picker selected-row highlight tint
} as const;

export const TREE_COLOR = {
  text:              'text-green-400',            // nav button active state (toolbar highlight)
  border:            'border border-green-400',   // bordered button style
  label:             BUTTON_LABEL_COLOR,             // label color on bordered buttons
  borderHover:       'hover:bg-green-400/20',     // subtle fill on hover for bordered button
  borderHoverBorder: 'hover:border-green-400',    // border color on hover for tool buttons
  underline:         'border-b border-green-400', // active nav button underline indicator
} as const;

export const DEAD_COLOR = {
  text:              'text-red-500',          // nav button active state (toolbar highlight)
  border:            'border border-red-500', // bordered button style
  label:             BUTTON_LABEL_COLOR,       // label color on bordered buttons
  borderHover:       'hover:bg-red-500/20',   // subtle fill on hover for bordered button
  borderHoverBorder: 'hover:border-red-500',  // border color on hover for tool buttons
  underline:         'border-b border-red-500', // active nav button underline indicator
  alertBorder:       'border-red-500',        // warning card border in TreeDeadView
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
  dead:         DEAD_COLOR.text,    // "R.I.P." tree-type label + dead countdown in StatusSection
  sapling:      'text-cyan-400',    // sapling type label while tree is a sapling
  matureAlive:  TREE_COLOR.text,    // mature / alive tree type label
  deathTimer:   'text-orange-400',  // "Dies in ~" countdown while tree is alive
  saplingTimer: 'text-yellow-300',  // "Matures in ~" countdown while tree is a sapling
  spawnTimer:   SPAWN_COLOR.text,   // "Next:" / "Spawn in" countdown before tree arrives
  rewardTimer:  'text-gray-300',    // "Clears in" reward-window countdown after tree dies
} as const;

/** Filter / sort chip UI states (SortFilterBar — FilterChip, TriStateChip, activeSummary pills) */

export const CHIP_COLOR = {
  inactive:   'bg-transparent border border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200',
  active:     'bg-green-400/20 border border-green-400 text-white font-semibold hover:bg-green-400/30',
  sortActive: 'bg-green-400/20 border border-green-400 text-white font-semibold hover:bg-green-400/30',
  needs:      'bg-amber-500/20 border border-amber-500 text-white font-semibold hover:bg-amber-500/30',
  has:        'bg-green-400/20 border border-green-400 text-white font-semibold hover:bg-green-400/30',
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
  disconnectedIcon: 'text-red-500',                        // XCircle icon when disconnected
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

/** Pre-built status → border color map (SessionBar compound status button) */
export const STATUS_BORDER_COLORS: Record<SessionStatus, string> = {
  connected:    'border-green-400',
  connecting:   'border-yellow-400',
  disconnected: DEAD_COLOR.alertBorder,  // matches Leave Session button (red-500)
};

/** Pre-built status → hover background map (SessionBar compound status button) */
export const STATUS_HOVER_BG: Record<SessionStatus, string> = {
  connected:    'hover:bg-green-400/20',
  connecting:   'hover:bg-yellow-400/20',
  disconnected: DEAD_COLOR.borderHover,  // matches Leave Session button (red-500/20)
};

/** Pre-built status → divide color map (SessionBar compound status button divider) */
export const STATUS_DIVIDE_COLORS: Record<SessionStatus, string> = {
  connected:    'divide-green-400',
  connecting:   'divide-yellow-400',
  disconnected: 'divide-red-500',  // matches Leave Session button (red-500)
};

/** Member role display colors and labels (MemberPanel + SessionView) */
export const ROLE_COLORS = {
  owner:     'text-yellow-400',
  moderator: 'text-blue-400',
  scout:     'text-green-400',
  viewer:    'text-gray-400',
} as const;

export const ROLE_LABELS = {
  owner:     'Owner',
  moderator: 'Mod',
  scout:     'Scout',
  viewer:    'Viewer',
} as const;

/** Alt1 SplitButton color tokens (token display in SessionBar) */
export const ALT1_BORDER_COLOR = 'border-cyan-400';
export const ALT1_DIVIDE_COLOR = 'divide-cyan-400';
export const ALT1_HOVER_BG     = 'hover:bg-cyan-400/20';

/** Alt1 Scout plugin link color (button outline + token code display) */
export const ALT1_COLOR = {
  text:        'text-cyan-400',          // personal token code display
  border:      'border border-cyan-400', // bordered button style
  label:       BUTTON_LABEL_COLOR,       // label color on bordered button
  borderHover: 'hover:bg-cyan-400/20',   // subtle fill on hover
  panelBorder: 'border border-cyan-400/50', // panel border
} as const;

/** Managed/fork session button and banner color (yellow — matches P2P world card border) */
export const MANAGED_COLOR = {
  border:      'border border-yellow-500',    // bordered button style
  label:       BUTTON_LABEL_COLOR,            // label color on bordered button
  borderHover: 'hover:bg-yellow-500/20',      // subtle fill on hover
  panelBorder: 'border border-yellow-500/50', // banner panel border
} as const;

/** Inline error messages and error panel styling */
export const ERROR_COLOR = {
  text:        'text-red-500',
  textHover:   'hover:text-red-400',
  panelBorder: 'border border-red-500/50',  // thin red border, no bg — mirrors MANAGED_COLOR.panelBorder style
} as const;

/** Base classes for secondary (gray) action buttons.
 *  Add sizing (py-2 / py-2.5) and layout (flex-1, w-full, mt-6) per usage. */
export const BUTTON_SECONDARY = 'bg-transparent border border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200 font-medium rounded transition-colors';
