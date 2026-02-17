import type { ClientMessage } from '../shared/protocol.ts';
import { TREE_TYPES } from '../shared/types.ts';
import type { WorldState, WorldStates, TreeType } from '../shared/types.ts';
import worldsData from '../src/data/worlds.json' with { type: 'json' };

const VALID_WORLD_IDS = new Set(worldsData.worlds.map(w => w.id));
const VALID_TREE_TYPES = new Set<string>(TREE_TYPES);
const MAX_STRING_LEN = 200;
const MAX_MS_FROM_NOW = 2 * 60 * 60 * 1000; // 2 hours
const VALID_HEALTH_VALUES = new Set(
  Array.from({ length: 20 }, (_, i) => (i + 1) * 5), // 5, 10, 15, ..., 100
);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sanitizeString(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  // Strip control characters
  const clean = s.replace(/[\x00-\x1F\x7F]/g, '').trim();
  if (clean.length > MAX_STRING_LEN) return null;
  return clean;
}

const VALID_TREE_STATUSES = new Set(['none', 'sapling', 'mature', 'alive', 'dead']);
const MAX_WORLDS_INITIALIZE = 200;

function validateWorldState(worldId: number, raw: unknown): WorldState | null {
  if (!isObject(raw)) return null;
  if (!VALID_WORLD_IDS.has(worldId)) return null;

  const status = raw.treeStatus;
  if (typeof status !== 'string' || !VALID_TREE_STATUSES.has(status)) return null;

  const state: WorldState = { treeStatus: status as WorldState['treeStatus'] };

  // Optional number timestamps
  for (const key of ['nextSpawnTarget', 'spawnSetAt', 'treeSetAt', 'matureAt', 'deadAt'] as const) {
    if (raw[key] !== undefined) {
      if (typeof raw[key] !== 'number' || !Number.isFinite(raw[key] as number)) return null;
      state[key] = raw[key] as number;
    }
  }

  if (raw.treeType !== undefined) {
    if (typeof raw.treeType !== 'string' || !VALID_TREE_TYPES.has(raw.treeType)) return null;
    state.treeType = raw.treeType as TreeType;
  }

  if (raw.treeHint !== undefined) {
    const clean = sanitizeString(raw.treeHint);
    if (clean === null) return null;
    state.treeHint = clean;
  }

  if (raw.treeExactLocation !== undefined) {
    const clean = sanitizeString(raw.treeExactLocation);
    if (clean === null) return null;
    state.treeExactLocation = clean;
  }

  if (raw.treeHealth !== undefined) {
    if (typeof raw.treeHealth !== 'number' || !VALID_HEALTH_VALUES.has(raw.treeHealth)) return null;
    state.treeHealth = raw.treeHealth;
  }

  return state;
}

export function validateInitializeState(raw: unknown): WorldStates | { error: string } {
  if (!isObject(raw)) return { error: 'Message must be a JSON object.' };
  if (!isObject(raw.worlds)) return { error: 'Missing worlds object.' };

  const entries = Object.entries(raw.worlds);
  if (entries.length > MAX_WORLDS_INITIALIZE) {
    return { error: 'Too many worlds in initializeState.' };
  }

  const worlds: WorldStates = {};
  for (const [key, value] of entries) {
    const worldId = Number(key);
    if (!Number.isInteger(worldId)) continue;
    const state = validateWorldState(worldId, value);
    if (!state) continue; // skip invalid entries silently
    // Only include active worlds
    if (state.treeStatus !== 'none' || state.nextSpawnTarget !== undefined) {
      worlds[worldId] = state;
    }
  }
  return worlds;
}

export function validateMessage(raw: unknown): ClientMessage | { error: string } {
  if (!isObject(raw)) return { error: 'Message must be a JSON object.' };

  const type = raw.type;

  if (type === 'ping') return { type: 'ping' };

  if (type === 'initializeState') {
    const result = validateInitializeState(raw);
    if ('error' in result) return result;
    return { type: 'initializeState', worlds: result };
  }

  // Optional msgId for ACK tracking
  let msgId: number | undefined;
  if (raw.msgId !== undefined) {
    if (typeof raw.msgId !== 'number' || !Number.isInteger(raw.msgId) || raw.msgId <= 0) {
      return { error: 'Invalid msgId.' };
    }
    msgId = raw.msgId;
  }

  // All other messages require a valid worldId
  if (typeof raw.worldId !== 'number' || !VALID_WORLD_IDS.has(raw.worldId)) {
    return { error: 'Invalid or missing worldId.' };
  }
  const worldId = raw.worldId;

  switch (type) {
    case 'setSpawnTimer': {
      const msFromNow = raw.msFromNow;
      if (typeof msFromNow !== 'number' || msFromNow <= 0 || msFromNow > MAX_MS_FROM_NOW || !Number.isInteger(msFromNow)) {
        return { error: 'msFromNow must be a positive integer up to 2 hours.' };
      }
      let treeInfo: { treeHint?: string } | undefined;
      if (isObject(raw.treeInfo)) {
        const hint = raw.treeInfo.treeHint;
        if (hint !== undefined) {
          const clean = sanitizeString(hint);
          if (clean === null) return { error: 'Invalid treeHint string.' };
          treeInfo = { treeHint: clean };
        }
      }
      return { type: 'setSpawnTimer', worldId, msFromNow, treeInfo, msgId };
    }

    case 'setTreeInfo': {
      if (!isObject(raw.info)) return { error: 'Missing info object.' };
      const info = raw.info;

      if (typeof info.treeType !== 'string' || !VALID_TREE_TYPES.has(info.treeType)) {
        return { error: 'Invalid treeType.' };
      }
      const treeHint = sanitizeString(info.treeHint);
      if (treeHint === null) return { error: 'Invalid treeHint.' };

      let treeExactLocation: string | undefined;
      if (info.treeExactLocation !== undefined) {
        const clean = sanitizeString(info.treeExactLocation);
        if (clean === null) return { error: 'Invalid treeExactLocation.' };
        treeExactLocation = clean;
      }

      let treeHealth: number | undefined;
      if (info.treeHealth !== undefined) {
        if (typeof info.treeHealth !== 'number' || !VALID_HEALTH_VALUES.has(info.treeHealth)) {
          return { error: 'Invalid treeHealth.' };
        }
        treeHealth = info.treeHealth;
      }

      return {
        type: 'setTreeInfo',
        worldId,
        info: {
          treeType: info.treeType as import('../shared/types.ts').TreeType,
          treeHint,
          treeExactLocation,
          treeHealth,
        },
        msgId,
      };
    }

    case 'updateTreeFields': {
      if (!isObject(raw.fields)) return { error: 'Missing fields object.' };
      const fields = raw.fields;
      const result: Record<string, unknown> = {};

      if (fields.treeType !== undefined) {
        if (typeof fields.treeType !== 'string' || !VALID_TREE_TYPES.has(fields.treeType)) {
          return { error: 'Invalid treeType.' };
        }
        result.treeType = fields.treeType;
      }

      if (fields.treeHint !== undefined) {
        const clean = sanitizeString(fields.treeHint);
        if (clean === null) return { error: 'Invalid treeHint.' };
        result.treeHint = clean;
      }

      if (fields.treeExactLocation !== undefined) {
        const clean = sanitizeString(fields.treeExactLocation);
        if (clean === null) return { error: 'Invalid treeExactLocation.' };
        result.treeExactLocation = clean;
      }

      if (fields.treeHealth !== undefined) {
        if (typeof fields.treeHealth !== 'number' || !VALID_HEALTH_VALUES.has(fields.treeHealth)) {
          return { error: 'Invalid treeHealth.' };
        }
        result.treeHealth = fields.treeHealth;
      }

      return {
        type: 'updateTreeFields',
        worldId,
        fields: result as import('../shared/types.ts').TreeFieldsPayload,
        msgId,
      };
    }

    case 'updateHealth': {
      const health = raw.health;
      if (health !== undefined && (typeof health !== 'number' || !VALID_HEALTH_VALUES.has(health))) {
        return { error: 'Invalid health value.' };
      }
      return { type: 'updateHealth', worldId, health: health as number | undefined, msgId };
    }

    case 'markDead':
      return { type: 'markDead', worldId, msgId };

    case 'clearWorld':
      return { type: 'clearWorld', worldId, msgId };

    default:
      return { error: `Unknown message type: ${String(type)}` };
  }
}

export function validateSessionCode(code: unknown): string | null {
  if (typeof code !== 'string') return null;
  if (!/^[A-Z0-9]{6}$/.test(code)) return null;
  return code;
}
