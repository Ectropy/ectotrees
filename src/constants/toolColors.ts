/**
 * Canonical per-tool color tokens.
 * Update a single entry here to change a tool's color everywhere in the UI.
 * Full Tailwind class strings are required so the compiler can statically
 * detect them during the build purge pass.
 */

export const SPAWN_COLOR = {
  text:        'text-blue-700',    // nav button active state
  bg:          'bg-blue-700',      // primary button background
  bgHover:     'hover:bg-blue-600',// primary button hover
  toolHover:   'hover:bg-blue-700',// small card-tool-button hover
  subtle:      'bg-blue-700/20',   // wheel-picker highlight
} as const;

export const TREE_COLOR = {
  text:        'text-green-700',
  bg:          'bg-green-700',
  bgHover:     'hover:bg-green-600',
  toolHover:   'hover:bg-green-700',
} as const;

export const DEAD_COLOR = {
  text:        'text-red-700',
  bg:          'bg-red-700',
  bgHover:     'hover:bg-red-600',
  toolHover:   'hover:bg-red-700',
  alertBorder: 'border-red-800',   // warning card border in TreeDeadView
} as const;

/** World membership type colors */

export const P2P_COLOR = {
  text:   'text-yellow-200',                       // type label in view headers
  badge:  'text-yellow-100 border border-yellow-500', // type badge in WorldCard
  border: 'border-yellow-500',                     // card border accent
} as const;

export const F2P_COLOR = {
  text:   'text-blue-200',                         // type label in view headers
  badge:  'text-blue-200 border border-blue-500',  // type badge in WorldCard
  border: 'border-blue-500',                       // card border accent
} as const;
