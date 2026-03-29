import type { ClientMessage } from '../shared/protocol.ts';
import { TREE_TYPES } from '../shared/types.ts';
import type { WorldState, WorldStates, TreeType } from '../shared/types.ts';
import { LOCATION_HINTS } from '../shared/hints.ts';
import worldsData from '../src/data/worlds.json' with { type: 'json' };
import { warn } from './log.ts';
import { containsProfanity } from './profanity.ts';

const VALID_WORLD_IDS = new Set(worldsData.worlds.map(w => w.id));
const VALID_TREE_TYPES = new Set<string>(TREE_TYPES);
const MAX_STRING_LEN = 200;
const MAX_MS_FROM_NOW = 2 * 60 * 60 * 1000; // 2 hours
const VALID_HEALTH_VALUES = new Set(
  Array.from({ length: 20 }, (_, i) => (i + 1) * 5), // 5, 10, 15, ..., 100
);
const VALID_HINTS = new Set(LOCATION_HINTS.map(h => h.hint));
const VALID_EXACT_LOCATIONS = new Set(LOCATION_HINTS.flatMap(h => h.locations));

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sanitizeString(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  // Strip control characters
  // eslint-disable-next-line no-control-regex
  const clean = s.replace(/[\x00-\x1F\x7F]/g, '').trim();
  if (clean.length > MAX_STRING_LEN) return null;
  return clean;
}

/** Empty string is allowed (clears the field). Non-empty must be a canonical hint. */
function validateHint(s: unknown): string | null {
  const clean = sanitizeString(s);
  if (clean === null) return null;
  if (clean !== '' && !VALID_HINTS.has(clean)) {
    warn(`[validation] rejected treeHint not in allowlist: "${String(s).slice(0, 100)}"`);
    return null;
  }
  return clean;
}

/** Empty string is allowed (clears the field). Non-empty must be a canonical exact location. */
function validateExactLocation(s: unknown): string | null {
  const clean = sanitizeString(s);
  if (clean === null) return null;
  if (clean !== '' && !VALID_EXACT_LOCATIONS.has(clean)) {
    warn(`[validation] rejected treeExactLocation not in allowlist: "${String(s).slice(0, 100)}"`);
    return null;
  }
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
    const clean = validateHint(raw.treeHint);
    if (clean === null) return null;
    state.treeHint = clean;
  }

  if (raw.treeExactLocation !== undefined) {
    const clean = validateExactLocation(raw.treeExactLocation);
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

  if (type === 'requestPersonalToken') return { type: 'requestPersonalToken' };

  if (type === 'reportWorld') {
    const worldId = raw.worldId;
    if (worldId !== null && (typeof worldId !== 'number' || !Number.isInteger(worldId) || worldId < 1 || worldId > 999)) {
      return { error: 'Invalid worldId for reportWorld.' };
    }
    return { type: 'reportWorld', worldId: worldId as number | null };
  }

  if (type === 'identify') {
    if (raw.clientType !== 'scout' && raw.clientType !== 'dashboard') {
      return { error: 'Invalid clientType.' };
    }
    return { type: 'identify', clientType: raw.clientType as 'scout' | 'dashboard' };
  }

  if (type === 'forkToManaged') {
    const name = sanitizeString(raw.name);
    if (!name) return { error: 'Name is required.' };
    return { type: 'forkToManaged', name };
  }

  if (type === 'selfRegister') {
    const name = sanitizeString(raw.name);
    if (!name) return { error: 'Name is required.' };
    const selfRegisterToken = sanitizeString(raw.selfRegisterToken);
    if (!selfRegisterToken) return { error: 'Self-registration token is required.' };
    let personalToken: string | undefined;
    if (raw.personalToken !== undefined) {
      const pt = validateInviteToken(raw.personalToken);
      if (!pt) return { error: 'Invalid personalToken.' };
      personalToken = pt;
    }
    return { type: 'selfRegister', name, selfRegisterToken, personalToken };
  }

  if (type === 'createInvite') {
    const name = sanitizeString(raw.name);
    if (!name) return { error: 'Name is required.' };
    const role = raw.role;
    if (role !== undefined && role !== 'scout' && role !== 'viewer') {
      return { error: 'Invalid role.' };
    }
    return { type: 'createInvite', name, role: role as 'scout' | 'viewer' | undefined };
  }

  if (type === 'kickMember') {
    const token = validateInviteToken(raw.inviteToken);
    if (!token) return { error: 'Invalid inviteToken.' };
    return { type: 'kickMember', inviteToken: token };
  }

  if (type === 'banMember') {
    const token = validateInviteToken(raw.inviteToken);
    if (!token) return { error: 'Invalid inviteToken.' };
    return { type: 'banMember', inviteToken: token };
  }

  if (type === 'renameMember') {
    const token = validateInviteToken(raw.inviteToken);
    if (!token) return { error: 'Invalid inviteToken.' };
    const name = sanitizeString(raw.name);
    if (!name) return { error: 'Name is required.' };
    return { type: 'renameMember', inviteToken: token, name };
  }

  if (type === 'setMemberRole') {
    const token = validateInviteToken(raw.inviteToken);
    if (!token) return { error: 'Invalid inviteToken.' };
    const role = raw.role;
    if (role !== 'moderator' && role !== 'scout' && role !== 'viewer') {
      return { error: 'Invalid role.' };
    }
    return { type: 'setMemberRole', inviteToken: token, role };
  }

  if (type === 'setAllowViewers') {
    if (typeof raw.allow !== 'boolean') return { error: 'allow must be a boolean.' };
    return { type: 'setAllowViewers', allow: raw.allow };
  }

  if (type === 'setAllowOpenJoin') {
    if (typeof raw.allow !== 'boolean') return { error: 'allow must be a boolean.' };
    return { type: 'setAllowOpenJoin', allow: raw.allow };
  }

  if (type === 'updateSessionSettings') {
    if (!isObject(raw.settings)) return { error: 'Missing settings object.' };
    const settings: { name?: string; description?: string; listed?: boolean } = {};
    if (raw.settings.name !== undefined) {
      const name = sanitizeString(raw.settings.name);
      if (name === null) return { error: 'Invalid session name.' };
      if (name.length > 50) return { error: 'Session name must be 50 characters or fewer.' };
      if (name && containsProfanity(name)) return { error: 'Session name contains inappropriate language.' };
      settings.name = name;
    }
    if (raw.settings.description !== undefined) {
      const description = sanitizeString(raw.settings.description);
      if (description === null) return { error: 'Invalid session description.' };
      if (description && containsProfanity(description)) return { error: 'Session description contains inappropriate language.' };
      settings.description = description;
    }
    if (raw.settings.listed !== undefined) {
      if (typeof raw.settings.listed !== 'boolean') return { error: 'listed must be a boolean.' };
      settings.listed = raw.settings.listed;
    }
    return { type: 'updateSessionSettings', settings };
  }

  if (type === 'transferOwnership') {
    const token = validateInviteToken(raw.inviteToken);
    if (!token) return { error: 'Invalid inviteToken.' };
    return { type: 'transferOwnership', inviteToken: token };
  }

  if (type === 'initializeState') {
    const result = validateInitializeState(raw);
    if ('error' in result) return result;
    return { type: 'initializeState', worlds: result };
  }

  if (type === 'contributeWorlds') {
    let msgId: number | undefined;
    if (raw.msgId !== undefined) {
      if (typeof raw.msgId !== 'number' || !Number.isInteger(raw.msgId) || raw.msgId <= 0) {
        return { error: 'Invalid msgId.' };
      }
      msgId = raw.msgId;
    }
    const result = validateInitializeState(raw);
    if ('error' in result) return result;
    return { type: 'contributeWorlds', worlds: result, msgId };
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
          const clean = validateHint(hint);
          if (clean === null) return { error: 'Invalid treeHint.' };
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
      const treeHint = validateHint(info.treeHint);
      if (treeHint === null) return { error: 'Invalid treeHint.' };

      let treeExactLocation: string | undefined;
      if (info.treeExactLocation !== undefined) {
        const clean = validateExactLocation(info.treeExactLocation);
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

      let lightningPreset: 50 | 25 | undefined;
      if (info.lightningPreset !== undefined) {
        if (info.lightningPreset !== 50 && info.lightningPreset !== 25) {
          return { error: 'Invalid lightningPreset.' };
        }
        lightningPreset = info.lightningPreset as 50 | 25;
      }

      return {
        type: 'setTreeInfo',
        worldId,
        info: {
          treeType: info.treeType as import('../shared/types.ts').TreeType,
          treeHint,
          treeExactLocation,
          treeHealth,
          lightningPreset,
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
        const clean = validateHint(fields.treeHint);
        if (clean === null) return { error: 'Invalid treeHint.' };
        result.treeHint = clean;
      }

      if (fields.treeExactLocation !== undefined) {
        const clean = validateExactLocation(fields.treeExactLocation);
        if (clean === null) return { error: 'Invalid treeExactLocation.' };
        result.treeExactLocation = clean;
      }

      if (fields.treeHealth !== undefined) {
        if (typeof fields.treeHealth !== 'number' || !VALID_HEALTH_VALUES.has(fields.treeHealth)) {
          return { error: 'Invalid treeHealth.' };
        }
        result.treeHealth = fields.treeHealth;
      }

      if (fields.lightningPreset !== undefined) {
        if (fields.lightningPreset !== 50 && fields.lightningPreset !== 25) {
          return { error: 'Invalid lightningPreset.' };
        }
        result.lightningPreset = fields.lightningPreset;
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

    case 'reportLightning': {
      const health = raw.health;
      if (health !== 50 && health !== 25) return { error: 'Invalid lightning health value.' };
      return { type: 'reportLightning', worldId, health, msgId };
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
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return null;
  return code;
}

export function validateInviteToken(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  if (!/^[A-HJ-NP-Z2-9]{12}$/.test(token)) return null;
  return token;
}

export function validateAuthMessage(raw: unknown):
  | { type: 'authSession'; code: string }
  | { type: 'authInvite'; token: string }
  | { type: 'authPersonal'; token: string }
  | { error: string }
{
  if (typeof raw !== 'object' || raw === null || !('type' in raw)) {
    return { error: 'Invalid message structure.' };
  }

  const { type } = raw as { type: string };

  if (type === 'authSession') {
    if (!('code' in raw)) return { error: 'Missing code field.' };
    const code = validateSessionCode(raw.code);
    if (!code) return { error: 'Invalid session code format.' };
    return { type: 'authSession', code };
  }

  if (type === 'authInvite') {
    if (!('token' in raw)) return { error: 'Missing token field.' };
    const token = validateInviteToken(raw.token);
    if (!token) return { error: 'Invalid invite token.' };
    return { type: 'authInvite', token };
  }

  if (type === 'authPersonal') {
    if (!('token' in raw)) return { error: 'Missing token field.' };
    const token = validateInviteToken(raw.token);
    if (!token) return { error: 'Invalid personal token.' };
    return { type: 'authPersonal', token };
  }

  return { error: `Unknown auth type: ${type}` };
}
