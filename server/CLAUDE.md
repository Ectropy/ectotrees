# Server

## File Structure

```
server/
  index.ts              # Express 5 + WebSocket server entry point
  session.ts            # In-memory session management, auto-transitions, expiry
  validation.ts         # Input validation for all WebSocket messages
  profanity.ts          # containsProfanity(text): boolean — wraps the obscenity library; used in validation
  log.ts                # Timestamped logging with configurable timezone (LOG_TZ)
  tsconfig.json         # Server-specific TypeScript config (target: ESNext)
  __tests__/
    validation.test.ts  # Vitest unit tests for validateMessage, validateInitializeState
```

## Overview
Express 5 HTTP server with a `ws` WebSocket server attached in `noServer` mode (shares the same HTTP server via the `upgrade` event). All session state is **in-memory** (no database; state is lost on server restart).

Security response headers applied to all HTTP responses:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-XSS-Protection: 0`

## Environment Variables
| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | TCP port the server listens on |
| `LOG_TZ` | `America/New_York` | IANA timezone for server log timestamps (e.g. `UTC`, `Europe/London`) |
| `NODE_ENV` | — | Set to `production` to enable origin allowlisting (`ALLOWED_ORIGINS`) |
| `EXTRA_ORIGINS` | — | Comma-separated extra allowed origins appended to the production allowlist |
| `APP_URL` | `http://localhost:5173` | Public base URL of the app, used to build invite links (no trailing slash) |

## REST Endpoints
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/session` | Create a new session. Returns `{ code }` |
| `GET` | `/api/sessions` | Returns `{ sessions: SessionSummary[] }` — only sessions with `listed: true` |
| `POST` | `/api/session/:code/open-join` | Self-issue an identity token for an open-join session. Body: `{ name: string }`. Returns `{ identityToken }` or an error. |
| `GET` | `/api/health` | Health check. Returns `{ ok, uptimeSeconds, uptime, sessions, clients, version }` |

REST endpoints (except `/api/health`) are rate-limited to 20 requests/minute per IP.

## WebSocket Protocol
All clients connect to `ws://host/ws` (no query parameters). Authentication is message-based: immediately after the WebSocket opens, the client sends one of two auth messages (`authSession` or `authIdentity`). The server enforces a 10-second auth timeout — connections that don't authenticate are closed. In production, the `Origin` header must match the allowlist or the upgrade is rejected.

**Client → Server messages** (`ClientMessage`):
| Type | Payload |
|---|---|
| `authSession` | `code: string` — authenticate by session code (anonymous join) |
| `authIdentity` | `token: string` — authenticate by 12-char identity token (managed session member or scout/dashboard identity persistence) |
| `setSpawnTimer` | `worldId`, `msFromNow`, optional `treeInfo: { treeHint? }`, optional `msgId` |
| `setTreeInfo` | `worldId`, `info: TreeInfoPayload`, optional `msgId` |
| `updateTreeFields` | `worldId`, `fields: TreeFieldsPayload`, optional `msgId` |
| `updateHealth` | `worldId`, `health: number \| undefined`, optional `msgId` |
| `markDead` | `worldId`, optional `msgId` |
| `clearWorld` | `worldId`, optional `msgId` |
| `contributeWorlds` | `worlds: WorldStates`, optional `msgId` — merges joiner's local state into session; only worlds not already present are inserted |
| `initializeState` | `worlds: WorldStates` — seeds a fresh session with the creator's local state (no `msgId`) |
| `reportLightning` | `worldId`, `health: 50 \| 25`, optional `msgId` — reports a client-observed lightning strike; server applies `applyReportLightning` and broadcasts |
| `identify` | `clientType: 'scout' \| 'dashboard'` — declares this connection's role (no `msgId`) |
| `reportWorld` | `worldId: number \| null` — scout reports which world it is currently scouting (no `msgId`) |
| `requestIdentityToken` | (no payload, no `msgId`) — requests a 12-char identity token for persistence across reconnects |
| `forkToManaged` | `name: string` — initiates a fork of the current anonymous session to a new managed session; `name` is the initiator's display name; only works on non-managed sessions |
| `createInvite` | `name: string; role?: 'scout' \| 'viewer'` — creates a 12-char invite token for a named member |
| `banMember` | `identityToken: string` — disconnects and permanently revokes a member's identity token |
| `renameMember` | `identityToken: string; name: string` — renames a member (admin only) |
| `setMemberRole` | `identityToken: string; role: 'moderator' \| 'scout' \| 'viewer'` — changes a member's role (admin only) |
| `transferOwnership` | `identityToken: string` — transfers owner role to another member |
| `kickMember` | `identityToken: string` — disconnects a member without permanently revoking their token (admin only) |
| `setAllowOpenJoin` | `allow: boolean` — toggles whether anyone can self-issue a scout invite via `POST /api/session/:code/open-join` (admin only) |
| `updateSessionSettings` | `settings: { name?: string; description?: string; listed?: boolean }` — updates session metadata for the session browser (admin only) |
| `selfRegister` | `name: string; selfRegisterToken: string; identityToken?: string` — WebSocket-based self-registration into a managed session during fork invite window |
| `ping` | (no payload, no `msgId`) |

**Server → Client messages** (`ServerMessage`):
| Type | Payload |
|---|---|
| `authSuccess` | `sessionCode: string; identityToken?: string; managed?: boolean` — confirms authentication; `identityToken` included if the client authenticated via identity token; `managed` is `true` for managed sessions |
| `authError` | `reason: string; code?: 'invalid' \| 'expired' \| 'full' \| 'banned' \| 'timeout'` — authentication failed; connection is closed after this |
| `snapshot` | `worlds: WorldStates` — full state on connect |
| `worldUpdate` | `worldId`, `state: WorldState \| null` (`null` = cleared), optional `ownUpdate?: boolean` (true on originator's own dashboard connections), optional `source?: { name, role }` (public attribution in managed sessions, sent to non-originator clients) |
| `clientCount` | `count: number; scouts: number; dashboards: number; identityViewers: number; anonymousViewers: number` — broadcast on join/leave/type-change |
| `peerWorld` | `worldId: number \| null` — sent to dashboard when its linked scout changes worlds |
| `identity` | `name: string; role: MemberRole; sessionCode: string` — sent to a connecting member after joining a managed session |
| `identityToken` | `token: string` — response to `requestIdentityToken`; 12-char token persisted by clients for reconnection |
| `managedEnabled` | `identityToken: string` — sent to the session creator when a directly-upgraded managed session activates |
| `forkInvite` | `managedCode`, `inviteLink`, `initiatorName`, `expiresAt`, `selfRegisterToken?`, `identityToken?` — broadcast to all clients in an anonymous session when someone initiates a fork; `selfRegisterToken` is included so each client can self-register into the new managed session; `identityToken` is the client's existing identity token (if any) for migration |
| `forkInviteExpired` | (no payload) — broadcast when the fork invite window expires without completing |
| `forkCreated` | `managedCode: string; identityToken: string` — sent to the fork initiator when the managed session has been created and is ready |
| `inviteCreated` | `identityToken: string; name: string; link: string` — sent to the admin who created the invite |
| `memberJoined` | `name: string; clientType: 'scout' \| 'dashboard' \| 'unknown'` — broadcast when a member connects |
| `memberLeft` | `name: string; clientType: 'scout' \| 'dashboard' \| 'unknown'` — broadcast when a member disconnects |
| `memberList` | `members: MemberInfo[]` — full member list broadcast; admin recipients receive `identityToken` and `link` on each entry, regular members do not |
| `kicked` | (no payload) — sent to a member who was kicked (not banned); connection is closed but token remains valid |
| `banned` | `reason: string` — sent to a client whose invite token has been revoked |
| `allowOpenJoin` | `allow: boolean` — broadcast when the allow-open-join setting changes |
| `sessionSettingsUpdated` | `name: string \| null; description: string \| null; listed: boolean` — broadcast when session metadata is updated |
| `selfRegistered` | `identityToken: string` — confirms WebSocket-based self-registration succeeded; client uses token for `authIdentity` on reconnect |
| `peerScout` | `connected: boolean` — sent to a dashboard when its linked scout connects or disconnects |
| `redirect` | `code: string` — tells a client to disconnect and reconnect to a different session (used during fork migration for clients with identity tokens) |
| `ack` | `msgId: number` — confirms a mutation was applied |
| `pong` | (no payload) — response to `ping` |
| `error` | `message: string; serverVersion?: string` |
| `sessionClosed` | `reason: string` — sent before closing expired sessions |

## Session Management (`session.ts`)
- Session codes are 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0/O/1/I` to avoid ambiguity)
- Max 1000 concurrent sessions, max 1000 clients per session (500 in managed mode)
- Server runs auto-transitions every 10 seconds per session, broadcasting only changed worlds
- On connect: sends a `snapshot` of all active worlds, then broadcasts `clientCount`
- Session expiry (checked every 5 min): inactive > 10 days, or empty > 24 hours
- **Scout linking (identity tokens)**: a dashboard can request an identity token via `requestIdentityToken`; the server responds with a 12-char `identityToken` message. The scout connects using `authIdentity` with the same token, linking the two. The dashboard receives `peerWorld` messages when the scout reports world changes via `reportWorld`. Identity tokens persist across reconnects (stored in `localStorage` as `evilTree_inviteToken`).
- **Managed sessions**: created via the fork-to-managed flow (`forkToManaged` message). The initiator sends their display name; the server creates a new managed session and broadcasts `forkInvite` to all clients in the anonymous session, each receiving a `selfRegisterToken` and their `identityToken` (if any). Clients self-register via the WebSocket `selfRegister` message (returns a `selfRegistered` confirmation with an `identityToken`) then reconnect to the managed session using `authIdentity`. The initiator receives `forkCreated` with their `identityToken`. Fork invite window is 15 minutes (`FORK_INVITE_TTL_MS`); cooldown between forks equals the invite TTL (`FORK_COOLDOWN_MS = FORK_INVITE_TTL_MS`, also 15 minutes) — a new fork is allowed once the current invite window closes. Identity tokens are 12-char, persisted to client localStorage for reconnect. Roles: `owner | moderator | scout | viewer`. Viewers cannot submit mutations (enforced by `canWrite()` check). Anonymous `authSession` connections are admitted to a managed session as read-only viewers **only if the session is `listed: true`** (set via `updateSessionSettings`); private (unlisted) managed sessions reject all anonymous joins with `'This is a private session.'`. `allowOpenJoin` flag (toggled via `setAllowOpenJoin`) allows anyone to self-issue a scout-role identity token via `POST /api/session/:code/open-join` (name required; returned token used for `authIdentity`). Admins (owner/moderator) receive `identityToken` and `link` on each `MemberInfo` in `memberList`. Kick = disconnect without revoking token; Ban = disconnect + permanent token revocation. `worldUpdate.ownUpdate` is true on the originator's own dashboard connections; managed sessions also include `worldUpdate.source` with `{ name, role }` for non-originator clients.
- **Session browser**: managed sessions can opt in to public discovery by setting `listed: true` via `updateSessionSettings` (also sets `name` and optional `description`). Listed sessions appear in `GET /api/sessions` as `SessionSummary` objects and are displayed in `SessionBrowserView`.

## Validation (`validation.ts`)
- `worldId` must exist in `worlds.json`
- `msFromNow` must be a positive integer, max 2 hours
- Strings are sanitized (control chars stripped, max 200 chars) and checked for profanity via `containsProfanity()`
- `treeType` must be a known type; `treeHealth` must be 5/10/15/.../100

## Per-Connection Protections
- Auth timeout: 10 seconds to send an auth message after WebSocket open
- Max message size: 4 KB (64 KB for `initializeState` and `contributeWorlds`)
- Rate limit: 10 messages/second per WebSocket connection
- Heartbeat: server pings every 30s, closes if no pong within 90s
